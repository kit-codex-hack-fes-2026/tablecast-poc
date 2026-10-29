import { env, exports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { z } from "zod";
import * as business from "../src/db/business-schema";
import { foodResultSchema, japaneseAllergenSchema } from "../src/modules/catalog/food-model";
import { getCatalog } from "../src/modules/catalog/queries";
import { getConfigurationRelease } from "../src/modules/configuration/queries";
import {
  createDraft,
  updateDraft,
  validateDraft,
} from "../src/modules/configuration/use-cases/drafts";
import { publishDraft } from "../src/modules/configuration/use-cases/publish";
import { updateCart } from "../src/modules/orders/use-cases/cart";
import { prepareConfirmation, submitOrder } from "../src/modules/orders/use-cases/confirmation";
import { getTableState } from "../src/modules/tables/queries";
import { createApiServices } from "../src/platform/context";
import { configuration, device, deviceToken, setupFixture } from "./fixture";
import { foodProduct } from "./food-fixture";

const call = (path: string, cookie: string, value: unknown) =>
  exports.default.fetch(
    new Request(`http://localhost:3000${path}`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify(value),
    }),
  );

it("店舗境界で食事情報を照会し、公開・カート・注文に同じ判定と根拠を保持する", async () => {
  const { staff, cookie } = await setupFixture();
  const services = createApiServices(env);
  let draft = await createDraft(services, staff);
  const product = foodProduct();
  const next = { ...draft.configuration, products: [product] };
  draft = await updateDraft(services, staff, draft.id, {
    expectedVersion: draft.version,
    configuration: next,
  });
  expect(draft.changes.some((change) => change.sensitive && change.path.includes("foodInfo"))).toBe(
    true,
  );
  const preview = await call(
    `/api/admin/stores/${staff.storeId}/food-information/preview`,
    cookie,
    { product, selections: [{ optionId: "no-cheese", quantity: 1 }] },
  );
  expect(preview.status).toBe(200);
  expect(await preview.json()).toMatchObject({
    complete: true,
    foodInformation: { allergens: { milk: "contains" } },
  });
  const ready = await validateDraft(services, staff, draft.id, draft.version);
  expect(ready.errors).toEqual([]);
  await publishDraft(services, staff, draft.id, {
    expectedVersion: ready.version,
    baseVersion: ready.baseVersion,
    approved: true,
    idempotencyKey: "tablecast-food-publication",
  });
  const selections = [
    { optionId: "no-cheese", quantity: 1 },
    { optionId: "lettuce", quantity: 1 },
  ];
  const path = "/api/table/catalog/food-information";
  expect((await call(path, "", { productId: product.id, selections })).status).toBe(401);
  expect(
    (
      await call(path, `tablecast.device=${deviceToken}`, {
        productId: "another-store-product",
        selections,
      })
    ).status,
  ).toBe(404);
  const response = await call(path, `tablecast.device=${deviceToken}`, {
    productId: product.id,
    selections,
  });
  expect(response.status).toBe(200);
  const result = z
    .object({
      configVersion: z.number(),
      complete: z.boolean(),
      foodInformation: foodResultSchema,
      optionAllergens: z.record(
        z.string(),
        z.object({ contains: z.array(japaneseAllergenSchema), unverified: z.boolean() }),
      ),
    })
    .parse(await response.json());
  expect(result).toMatchObject({
    configVersion: 2,
    complete: true,
    foodInformation: { allergens: { milk: "not_used" } },
    optionAllergens: {
      "extra-cheese": { contains: ["milk"], unverified: false },
      "no-cheese": { contains: [], unverified: false },
    },
  });
  expect((await getTableState(services, device)).cart.version).toBe(0);
  const cart = await updateCart(services, device, {
    expectedVersion: 0,
    lines: [{ id: "food-line", productId: product.id, quantity: 1, selections }],
  });
  expect(cart.cart.lines[0]?.foodInformation).toEqual(result.foodInformation);
  const snapshot = await prepareConfirmation(services, device, {
    expectedVersion: cart.cart.version,
    channel: "gui",
  });
  const order = await submitOrder(services, device, {
    snapshotId: snapshot.id,
    approved: true,
    idempotencyKey: "tablecast-food-order",
  });
  expect(order.snapshot.lines[0]?.foodInformation).toEqual(result.foodInformation);
  await services.db
    .update(business.stores)
    .set({ config_version: 3, config_json: JSON.stringify(configuration) })
    .where(eq(business.stores.id, staff.storeId));
  const stored = await services.db
    .select({ snapshot: business.orders.snapshot_json })
    .from(business.orders)
    .where(eq(business.orders.id, order.id))
    .get();
  expect(JSON.parse(stored?.snapshot ?? "null")).toMatchObject({
    configVersion: 2,
    lines: [{ foodInformation: result.foodInformation }],
  });
});

it("旧公開設定と履歴を読取り変換し、原本と未知の品目を変えずに下書きへ引き継ぐ", async () => {
  const { staff } = await setupFixture();
  const services = createApiServices(env);
  const product = configuration.products[0];
  if (!product) throw new Error("旧商品fixtureがありません");
  const { foodInfo: _foodInfo, ...oldProduct } = product;
  const legacy = JSON.stringify({
    ...configuration,
    products: [
      {
        ...oldProduct,
        allergens: {
          contains: ["milk"],
          evidence: "verified",
          crossContact: "unknown",
          vegan: "no",
          note: { ja: "乳を登録済み", en: "Milk is recorded" },
        },
      },
    ],
  });
  await services.db.batch([
    services.db
      .update(business.stores)
      .set({ config_json: legacy })
      .where(eq(business.stores.id, staff.storeId)),
    services.db.insert(business.configReleases).values({
      store_id: staff.storeId,
      version: 1,
      config_json: legacy,
      published_by: staff.userId ?? "tablecast-staff",
      created_at: 1,
    }),
  ]);
  expect(
    (await getCatalog(services, staff.storeId)).configuration.products[0]?.foodInfo.base.allergens,
  ).toEqual({ milk: "contains" });
  expect(
    (await getConfigurationRelease(services, staff, 1)).configuration?.products[0]?.foodInfo.base
      .dietary.vegan.status,
  ).toBe("no");
  expect(
    (await createDraft(services, staff)).configuration.products[0]?.foodInfo.base.allergens.wheat,
  ).toBeUndefined();
  expect(
    await services.db
      .select({ json: business.configReleases.config_json })
      .from(business.configReleases)
      .where(eq(business.configReleases.store_id, staff.storeId))
      .get(),
  ).toEqual({ json: legacy });
});
