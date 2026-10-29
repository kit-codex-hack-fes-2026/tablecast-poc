import { and, eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { configReleases, payments, stores } from "../src/db/table-schema";
import { posCheckoutViewSchema } from "../src/modules/pos/model";
import { fixtureDb } from "./database-fixture";
import { configuration } from "./fixture";
import {
  checkoutPath,
  posConfiguration,
  request,
  setupPosFixture,
  squareHttp,
} from "./pos-fixture";

afterEach(() => vi.restoreAllMocks());

it("旧allergens形式の注文版を共通互換読取で保持し、現行版の値上げを既存請求へ混ぜない", async () => {
  const { cookie, table } = await setupPosFixture();
  const legacy = {
    ...posConfiguration,
    products: configuration.products.map(({ foodInfo: _foodInfo, ...product }) => ({
      ...product,
      allergens: {
        contains: ["milk"],
        evidence: "verified",
        crossContact: "unknown",
        vegan: "unknown",
        note: { ja: "旧注文時の情報", en: "Information at the time of ordering" },
      },
    })),
  };
  const current = {
    ...configuration,
    products: configuration.products.map((product) =>
      product.id === "tea" ? { ...product, price: 999 } : product,
    ),
  };
  await fixtureDb.batch([
    fixtureDb
      .update(configReleases)
      .set({ config_json: JSON.stringify(legacy) })
      .where(and(eq(configReleases.store_id, "tablecast-store"), eq(configReleases.version, 1))),
    fixtureDb
      .update(stores)
      .set({ config_version: 2, config_json: JSON.stringify(current) })
      .where(eq(stores.id, "tablecast-store")),
  ]);
  const provider = squareHttp();
  const preview = await request(checkoutPath + "/preview", cookie, "POST");
  expect(preview.status).toBe(200);
  expect(posCheckoutViewSchema.parse(await preview.json())).toMatchObject({
    canStart: true,
    issues: [],
    invoice: { total: 400, lines: [{ unitPrice: 400, referencePrice: 400 }] },
  });
  const started = await request(checkoutPath + "/start", cookie, "POST", {
    expectedVersion: table.cart.version,
    idempotencyKey: "tablecast-pos-legacy-food",
  });
  expect(started.status).toBe(200);
  provider.state.completed = true;
  const completed = await request(checkoutPath + "/reconcile", cookie, "POST");
  expect(completed.status).toBe(200);
  expect(posCheckoutViewSchema.parse(await completed.json())).toMatchObject({
    locked: false,
    checkout: { status: "completed", amount: 400 },
  });
  expect(await fixtureDb.select().from(payments)).toMatchObject([
    { amount: 400, reason: "Square" },
  ]);
});
