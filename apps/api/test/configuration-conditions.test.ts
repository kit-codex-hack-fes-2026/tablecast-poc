import { env, exports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import * as businessTables from "../src/db/business-schema";
import { getCatalog } from "../src/modules/catalog/queries";
import { getDraft } from "../src/modules/configuration/queries";
import {
  createDraft,
  updateDraft,
  validateDraft,
} from "../src/modules/configuration/use-cases/drafts";
import { publishDraft } from "../src/modules/configuration/use-cases/publish";
import { updateCart } from "../src/modules/orders/use-cases/cart";
import { prepareConfirmation, submitOrder } from "../src/modules/orders/use-cases/confirmation";
import { createApiServices } from "../src/platform/context";
import { device, configuration as fixtureConfiguration, setupFixture } from "./fixture";

const call = (url: string, auth: string, payload: unknown) =>
  exports.default.fetch(
    new Request(url, {
      method: "POST",
      headers: { Cookie: auth, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );

it("条件の保存・公開・注文を共有し、条件消失と古い版の保存を拒否する", async () => {
  const { staff, cookie } = await setupFixture();
  const services = createApiServices(env);
  const draft = await createDraft(services, staff);
  const configuration = structuredClone(draft.configuration);
  const product = configuration.products.find((item) => item.id === "coffee");
  const group = product?.modifiers[0];
  const owner = group?.options.find((item) => item.id === "dairy");
  if (!product || !group || !owner) throw new Error("条件fixtureがありません");
  group.kind = "multiple";
  group.max = 2;
  owner.conditions = { version: 2, requires: { kind: "option", optionId: "oat" }, excludes: null };
  const saved = await updateDraft(services, staff, draft.id, {
    expectedVersion: draft.version,
    configuration,
  });
  const old = structuredClone(configuration);
  const oldOwner = old.products
    .find((item) => item.id === "coffee")
    ?.modifiers[0]?.options.find((item) => item.id === "dairy");
  if (!oldOwner) throw new Error("旧形式fixtureがありません");
  delete oldOwner.conditions;
  const response = await exports.default.fetch(
    new Request(`http://localhost:3000/api/admin/stores/${staff.storeId}/drafts/${draft.id}`, {
      method: "PUT",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ expectedVersion: saved.version, configuration: old }),
    }),
  );
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({
    error: { code: "CONFIGURATION_FORMAT_UNSUPPORTED" },
  });
  expect((await getDraft(services, staff, draft.id)).version).toBe(saved.version);
  await expect(
    updateDraft(services, staff, draft.id, { expectedVersion: draft.version, configuration }),
  ).rejects.toMatchObject({ code: "DRAFT_CONFLICT" });
  const ready = await validateDraft(services, staff, draft.id, saved.version);
  expect(ready.errors).toEqual([]);
  await publishDraft(services, staff, draft.id, {
    expectedVersion: ready.version,
    baseVersion: ready.baseVersion,
    approved: true,
    idempotencyKey: "tablecast-conditions-publish",
  });
  const line = {
    id: "conditional-coffee",
    productId: product.id,
    quantity: 1,
    selections: [{ optionId: owner.id, quantity: 1 }],
  };
  const incomplete = await updateCart(services, device, { expectedVersion: 0, lines: [line] });
  expect(incomplete.cart.complete).toBe(false);
  expect(incomplete.cart.lines[0]?.conditionIssues).toEqual([
    { optionId: "dairy", relation: "requires" },
  ]);
  await expect(
    prepareConfirmation(services, device, {
      expectedVersion: incomplete.cart.version,
      channel: "gui",
    }),
  ).rejects.toMatchObject({ code: "CART_INCOMPLETE" });
  const complete = await updateCart(services, device, {
    expectedVersion: incomplete.cart.version,
    lines: [{ ...line, selections: [...line.selections, { optionId: "oat", quantity: 1 }] }],
  });
  expect(complete.cart.complete).toBe(true);
  expect(complete.cart.lines).toHaveLength(1);
  const snapshot = await prepareConfirmation(services, device, {
    expectedVersion: complete.cart.version,
    channel: "gui",
  });
  expect(snapshot.total).toBe(complete.cart.total);
  const order = await submitOrder(services, device, {
    snapshotId: snapshot.id,
    approved: true,
    idempotencyKey: "tablecast-condition-order",
  });
  expect(order.snapshot.configVersion).toBe(2);
  expect(order.total).toBe(snapshot.total);
  const next = await createDraft(services, staff);
  const cleared = structuredClone(next.configuration);
  const clearing = cleared.products
    .find((item) => item.id === "coffee")
    ?.modifiers[0]?.options.find((item) => item.id === "dairy");
  if (!clearing) throw new Error("更新する条件がありません");
  clearing.conditions = { version: 2, requires: null, excludes: null };
  await expect(
    updateDraft(services, staff, next.id, {
      expectedVersion: next.version,
      configuration: cleared,
    }),
  ).resolves.toMatchObject({ version: next.version + 1 });
  const storedOrder = await services.db
    .select({ snapshot: businessTables.orders.snapshot_json })
    .from(businessTables.orders)
    .where(eq(businessTables.orders.id, order.id))
    .get();
  expect(storedOrder?.snapshot).toBe(JSON.stringify(order.snapshot));
});

it("条件の試行は認可と選択制約を検証し、保存せず各節の真偽を返す", async () => {
  const { staff, cookie } = await setupFixture();
  const product = structuredClone(fixtureConfiguration.products[1]);
  const owner = product?.modifiers[0]?.options[0];
  if (!product || !owner) throw new Error("条件fixtureがありません");
  owner.conditions = {
    version: 2,
    requires: { kind: "not", child: { kind: "option", optionId: "oat" } },
    excludes: null,
  };
  const endpoint = `http://localhost:3000/api/admin/stores/${staff.storeId}/conditions/preview`;
  const input = { product, optionId: owner.id, selections: [{ optionId: owner.id, quantity: 1 }] };
  const before = await getCatalog(createApiServices(env), staff.storeId);
  expect((await call(endpoint, "", input)).status).toBe(401);
  expect(
    (await call(endpoint.replace(staff.storeId, "tablecast-other"), cookie, input)).status,
  ).toBe(403);
  expect(
    (await call(endpoint, cookie, { ...input, selections: [{ optionId: owner.id, quantity: 0 }] }))
      .status,
  ).toBe(422);
  const response = await call(endpoint, cookie, input);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    applied: true,
    selectionError: null,
    errors: [],
    conditions: [
      {
        relation: "requires",
        matched: true,
        satisfied: true,
        nodes: [
          { path: [], matched: true },
          { path: ["child"], matched: false },
        ],
      },
      { relation: "excludes", matched: false, satisfied: true },
    ],
  });
  expect(await getCatalog(createApiServices(env), staff.storeId)).toEqual(before);
});

it("公開済み条件を旧下書きで消せず、参照切れは検証と公開で拒否する", async () => {
  const { staff } = await setupFixture();
  const services = createApiServices(env);
  const draft = await createDraft(services, staff);
  const configuration = structuredClone(draft.configuration);
  const owner = configuration.products[1]?.modifiers[0]?.options[0];
  if (!owner) throw new Error("条件fixtureがありません");
  owner.conditions = {
    version: 2,
    requires: { kind: "option", optionId: "missing" },
    excludes: null,
  };
  const saved = await updateDraft(services, staff, draft.id, {
    expectedVersion: draft.version,
    configuration,
  });
  const invalid = await validateDraft(services, staff, draft.id, saved.version);
  expect(invalid.errors[0]).toMatchObject({
    code: "OPTION_REFERENCE_INVALID",
    path: ["products", 1, "modifiers", 0, "options", 0, "conditions", "requires", "optionId"],
  });
  await expect(
    publishDraft(services, staff, draft.id, {
      expectedVersion: saved.version,
      baseVersion: draft.baseVersion,
      approved: true,
      idempotencyKey: "tablecast-invalid-condition",
    }),
  ).rejects.toMatchObject({ code: "DRAFT_INVALID" });
  owner.conditions.requires = null;
  const fixed = await updateDraft(services, staff, draft.id, {
    expectedVersion: saved.version,
    configuration,
  });
  await validateDraft(services, staff, draft.id, fixed.version);
  await publishDraft(services, staff, draft.id, {
    expectedVersion: fixed.version,
    baseVersion: draft.baseVersion,
    approved: true,
    idempotencyKey: "tablecast-condition-current",
  });
  const legacy = await createDraft(services, staff);
  await services.db
    .update(businessTables.configDrafts)
    .set({ config_json: JSON.stringify(fixtureConfiguration), status: "ready" })
    .where(eq(businessTables.configDrafts.id, legacy.id));
  await expect(
    publishDraft(services, staff, legacy.id, {
      expectedVersion: legacy.version,
      baseVersion: legacy.baseVersion,
      approved: true,
      idempotencyKey: "tablecast-legacy-condition",
    }),
  ).rejects.toMatchObject({ code: "CONFIGURATION_FORMAT_UNSUPPORTED" });
});

it("数量を含む条件試行で選択肢上限とグループの最小・最大数を判定する", async () => {
  const { staff, cookie } = await setupFixture();
  const product = structuredClone(fixtureConfiguration.products[1]);
  const group = product?.modifiers[0];
  const owner = group?.options[0];
  if (!product || !group || !owner) throw new Error("数量fixtureがありません");
  group.kind = "quantity";
  group.min = 2;
  group.max = 3;
  for (const option of group.options) option.maxQuantity = 2;
  owner.conditions = {
    version: 2,
    requires: {
      kind: "or",
      children: [
        { kind: "option", optionId: "oat" },
        { kind: "not", child: { kind: "option", optionId: "oat" } },
      ],
    },
    excludes: null,
  };
  const endpoint = `http://localhost:3000/api/admin/stores/${staff.storeId}/conditions/preview`;
  const before = await getCatalog(createApiServices(env), staff.storeId);
  for (const { selections, selectionError } of [
    { selections: [{ optionId: owner.id, quantity: 1 }], selectionError: "CART_INCOMPLETE" },
    { selections: [{ optionId: owner.id, quantity: 2 }], selectionError: null },
    { selections: [{ optionId: owner.id, quantity: 3 }], selectionError: "OPTION_QUANTITY" },
    {
      selections: [
        { optionId: owner.id, quantity: 2 },
        { optionId: "oat", quantity: 2 },
      ],
      selectionError: "TOO_MANY_OPTIONS",
    },
  ]) {
    const response = await call(endpoint, cookie, { product, optionId: owner.id, selections });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      applied: true,
      selectionError,
      errors: [],
      conditions: [
        { relation: "requires", matched: true, satisfied: true },
        { relation: "excludes", matched: false, satisfied: true },
      ],
    });
  }
  expect(await getCatalog(createApiServices(env), staff.storeId)).toEqual(before);
});
