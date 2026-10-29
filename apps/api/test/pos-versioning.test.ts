import { and, eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import type { Configuration } from "../src/modules/configuration/model";
import { posCheckouts, posConnections } from "../src/db/pos-schema";
import { configDrafts, configReleases, orders, payments, stores } from "../src/db/table-schema";
import { getCatalog } from "../src/modules/catalog/queries";
import { getDraft } from "../src/modules/configuration/queries";
import {
  createDraft,
  restoreConfigurationRelease,
  updateDraft,
  validateDraft,
} from "../src/modules/configuration/use-cases/drafts";
import { publishDraft } from "../src/modules/configuration/use-cases/publish";
import { getPosSettings } from "../src/modules/pos/connections";
import { posCheckoutViewSchema, posSettingsSchema } from "../src/modules/pos/model";
import { fixtureDb } from "./database-fixture";
import { configuration, deviceToken } from "./fixture";
import { posCatalogHttp } from "./mcp-pos-fixture";
import {
  base,
  checkoutPath,
  deviceId,
  mappings,
  posConfiguration,
  request,
  setupPosFixture,
  squareHttp,
} from "./pos-fixture";

afterEach(() => vi.restoreAllMocks());

it("商品と選択肢の削除は同じ下書きの既存対応だけに連動し、共有選択肢と新しい不明IDを消さない", async () => {
  const { staff, services } = await setupPosFixture();
  const initial: Configuration = structuredClone(posConfiguration);
  const tea = initial.products.find((product) => product.id === "tea");
  const coffee = initial.products.find((product) => product.id === "coffee");
  if (!tea || !coffee || !initial.pos) throw new Error("商品fixtureがありません");
  tea.modifiers = structuredClone(coffee.modifiers);
  initial.pos.mappings = [
    { kind: "product", localId: "tea", externalId: "square-tea" },
    { kind: "product", localId: "coffee", externalId: "square-coffee" },
    { kind: "option", localId: "oat", externalId: "square-oat" },
    { kind: "option", localId: "dairy", externalId: "square-dairy" },
  ];
  await fixtureDb.batch([
    fixtureDb
      .update(stores)
      .set({ config_json: JSON.stringify(initial) })
      .where(eq(stores.id, staff.storeId)),
    fixtureDb
      .update(configReleases)
      .set({ config_json: JSON.stringify(initial) })
      .where(eq(configReleases.store_id, staff.storeId)),
  ]);
  const draft = await createDraft(services, staff);
  draft.configuration.products = draft.configuration.products.filter(
    (product) => product.id !== "tea",
  );
  for (const group of draft.configuration.products.flatMap((product) => product.modifiers))
    group.options = group.options.filter((option) => option.id !== "oat");
  if (!draft.configuration.pos) throw new Error("対応fixtureがありません");
  const unknown = { kind: "option" as const, localId: "unknown-option", externalId: "unverified" };
  draft.configuration.pos.mappings.push(unknown);
  const saved = await updateDraft(services, staff, draft.id, {
    expectedVersion: 1,
    instructionFormatVersion: 1,
    configuration: draft.configuration,
  });
  const retained = [
    { kind: "product", localId: "coffee", externalId: "square-coffee" },
    { kind: "option", localId: "dairy", externalId: "square-dairy" },
  ];
  expect(saved.configuration.pos?.mappings).toEqual([...retained, unknown]);
  expect(saved.changes.find((change) => change.path === "pos")).toMatchObject({
    before: initial.pos,
    after: { ...initial.pos, mappings: [...retained, unknown] },
    sensitive: true,
  });
  expect((await validateDraft(services, staff, saved.id, saved.version)).errors).toContainEqual({
    code: "OPTION_NOT_FOUND",
    path: ["pos", "mappings", 2, "localId"],
    params: { optionId: unknown.localId },
  });
  if (!saved.configuration.pos) throw new Error("対応fixtureがありません");
  saved.configuration.pos.mappings = saved.configuration.pos.mappings.filter(
    (mapping) => mapping.localId !== unknown.localId,
  );
  const corrected = await updateDraft(services, staff, saved.id, {
    expectedVersion: saved.version,
    instructionFormatVersion: 1,
    configuration: saved.configuration,
  });
  const ready = await validateDraft(services, staff, corrected.id, corrected.version);
  expect(ready.errors).toEqual([]);
  await publishDraft(services, staff, ready.id, {
    expectedVersion: ready.version,
    baseVersion: 1,
    idempotencyKey: "tablecast-pos-delete-local",
    approved: true,
  });
  expect((await getCatalog(services, staff.storeId)).configuration.pos?.mappings).toEqual(retained);
  expect(
    JSON.parse(
      (
        await fixtureDb
          .select()
          .from(configReleases)
          .where(and(eq(configReleases.store_id, staff.storeId), eq(configReleases.version, 1)))
          .get()
      )?.config_json ?? "{}",
    ),
  ).toEqual(initial);
});

it("対応だけを下書きへ保存し、公開しても旧注文の送信先・価格・snapshotを変えない", async () => {
  const { cookie, staff, services } = await setupPosFixture();
  const beforeOrders = await fixtureDb.select().from(orders);
  const beforeConnection = await fixtureDb.select().from(posConnections).get();
  const draft = await createDraft(services, staff);
  posCatalogHttp();
  const input = {
    draftId: draft.id,
    expectedVersion: draft.version,
    connectionId: posConfiguration.pos.connectionId,
    mappings: [{ kind: "product", localId: "tea", externalId: "square-coffee" }],
  };
  const saved = await request(base + "/pos/mappings", cookie, "PUT", input);
  expect(saved.status).toBe(200);
  expect(posSettingsSchema.parse(await saved.json())).toMatchObject({
    publishedVersion: 1,
    draft: { id: draft.id, version: 2, baseVersion: 1 },
    mappings: input.mappings,
  });
  expect((await getPosSettings(services, staff)).mappings).toEqual(mappings);
  expect(await fixtureDb.select().from(posConnections).get()).toEqual(beforeConnection);
  expect((await request(base + "/pos/mappings", cookie, "PUT", input)).status).toBe(409);
  expect(
    (
      await request(base + "/pos/mappings", cookie, "PUT", {
        ...input,
        expectedVersion: 2,
        connectionId: "foreign-connection",
      })
    ).status,
  ).toBe(422);
  const edited = await getDraft(services, staff, draft.id);
  expect(edited.changes.filter((change) => change.path.startsWith("pos"))).toEqual([
    {
      path: "pos",
      before: posConfiguration.pos,
      after: { ...posConfiguration.pos, mappings: input.mappings },
      sensitive: true,
    },
  ]);
  const tea = edited.configuration.products.find((product) => product.id === "tea");
  if (!tea) throw new Error("商品fixtureがありません");
  tea.price = 900;
  await updateDraft(services, staff, draft.id, {
    expectedVersion: 2,
    instructionFormatVersion: 1,
    configuration: edited.configuration,
  });
  const draftSettings = posSettingsSchema.parse(
    await (await request(base + "/pos?draftId=" + draft.id, cookie)).json(),
  );
  expect(draftSettings.products.find((product) => product.id === "tea")?.price).toBe(900);
  expect(
    (await getPosSettings(services, staff)).products.find((product) => product.id === "tea")?.price,
  ).toBe(400);
  const ready = await validateDraft(services, staff, draft.id, 3);
  expect(ready.errors).toEqual([]);
  await publishDraft(services, staff, draft.id, {
    expectedVersion: ready.version,
    baseVersion: 1,
    idempotencyKey: "tablecast-pos-version-publish",
    approved: true,
  });
  expect((await getCatalog(services, staff.storeId)).configuration.pos?.mappings).toEqual(
    input.mappings,
  );
  expect(await fixtureDb.select().from(orders)).toEqual(beforeOrders);
  squareHttp();
  const preview = await request(checkoutPath + "/preview", cookie, "POST");
  expect(preview.status).toBe(200);
  expect(posCheckoutViewSchema.parse(await preview.json())).toMatchObject({
    canStart: true,
    invoice: { total: 400, lines: [{ externalId: "square-tea", referencePrice: 400 }] },
  });
});

it("旧live対応は明示取込候補だけに返し、下書きへ取り込んでも過去の対応なし注文を補完しない", async () => {
  const { cookie, staff, services } = await setupPosFixture();
  await fixtureDb.batch([
    fixtureDb
      .update(stores)
      .set({ config_json: JSON.stringify(configuration) })
      .where(eq(stores.id, staff.storeId)),
    fixtureDb
      .update(configReleases)
      .set({ config_json: JSON.stringify(configuration) })
      .where(eq(configReleases.store_id, staff.storeId)),
  ]);
  expect(await getPosSettings(services, staff)).toMatchObject({
    mappings: [],
    mappingConnectionId: null,
    legacyMappings: { connectionId: posConfiguration.pos.connectionId, mappings },
  });
  const draft = await createDraft(services, staff);
  posCatalogHttp();
  expect(
    (
      await request(base + "/pos/mappings", cookie, "PUT", {
        draftId: draft.id,
        expectedVersion: 1,
        connectionId: posConfiguration.pos.connectionId,
        mappings,
      })
    ).status,
  ).toBe(200);
  const ready = await validateDraft(services, staff, draft.id, 2);
  await publishDraft(services, staff, draft.id, {
    expectedVersion: ready.version,
    baseVersion: 1,
    idempotencyKey: "tablecast-pos-import-publish",
    approved: true,
  });
  expect((await getPosSettings(services, staff)).legacyMappings).toBeNull();
  const provider = squareHttp();
  const preview = posCheckoutViewSchema.parse(
    await (await request(checkoutPath + "/preview", cookie, "POST")).json(),
  );
  expect(preview.canStart).toBe(false);
  expect(preview.issues).toContainEqual({
    code: "POS_MAPPING_REQUIRED",
    localId: "tea",
    name: "ほうじ茶",
  });
  expect(provider.requests).toEqual([]);
});

it("旧clientのPOS省略と旧下書き公開を拒否し、過去版復元後は空対応による明示解除を許可する", async () => {
  const { staff, services } = await setupPosFixture();
  const draft = await createDraft(services, staff);
  await expect(
    updateDraft(services, staff, draft.id, {
      expectedVersion: draft.version,
      configuration,
      instructionFormatVersion: 1,
    }),
  ).rejects.toMatchObject({ code: "CONFIGURATION_FORMAT_UNSUPPORTED" });
  expect((await getDraft(services, staff, draft.id)).version).toBe(1);
  await fixtureDb.insert(configDrafts).values({
    id: "old-draft",
    store_id: staff.storeId,
    base_version: 1,
    version: 1,
    status: "ready",
    config_json: JSON.stringify(configuration),
    errors_json: "[]",
    created_by: staff.userId,
    created_at: Date.now(),
    updated_at: Date.now(),
  });
  await expect(
    publishDraft(services, staff, "old-draft", {
      expectedVersion: 1,
      baseVersion: 1,
      idempotencyKey: "tablecast-pos-old-client",
      approved: true,
    }),
  ).rejects.toMatchObject({ code: "CONFIGURATION_FORMAT_UNSUPPORTED" });
  await fixtureDb
    .update(configReleases)
    .set({ config_json: JSON.stringify(configuration) })
    .where(and(eq(configReleases.store_id, staff.storeId), eq(configReleases.version, 1)));
  const restored = await restoreConfigurationRelease(services, staff, 1, {
    draftId: crypto.randomUUID(),
    baseVersion: 1,
  });
  expect(restored.configuration.pos).toBeUndefined();
  const cleared = await updateDraft(services, staff, restored.id, {
    expectedVersion: restored.version,
    configuration: { ...restored.configuration, pos: { ...posConfiguration.pos, mappings: [] } },
    instructionFormatVersion: 1,
  });
  const ready = await validateDraft(services, staff, cleared.id, cleared.version);
  // 接続状態の変更は、同じ接続identityの設定履歴を無効にしない。
  await fixtureDb
    .update(posConnections)
    .set({ status: "disconnected", credentials: "", revision: 99 });
  await publishDraft(services, staff, ready.id, {
    expectedVersion: ready.version,
    baseVersion: 1,
    idempotencyKey: "tablecast-pos-clear-explicit",
    approved: true,
  });
  expect((await getCatalog(services, staff.storeId)).configuration.pos?.mappings).toEqual([]);
});

it("客catalogから対応を除き管理catalogには保持し、旧live保存payloadを実行しない", async () => {
  const { cookie, staff, services } = await setupPosFixture();
  const guest = await request("/api/table/catalog", `tablecast.device=${deviceToken}`);
  expect(guest.status).toBe(200);
  const body = await guest.text();
  expect(body).not.toContain("square-tea");
  expect(body).not.toContain("connectionId");
  expect((await getCatalog(services, staff.storeId)).configuration.pos).toEqual(
    posConfiguration.pos,
  );
  const before = await fixtureDb.select().from(posConnections).get();
  expect(
    (
      await request(base + "/pos", cookie, "PUT", {
        expectedRevision: 1,
        locationId: "square-location",
        deviceId,
        mappings,
      })
    ).status,
  ).toBe(422);
  expect(await fixtureDb.select().from(posConnections).get()).toEqual(before);
  if (!before) throw new Error("接続fixtureがありません");
  await fixtureDb.batch([
    fixtureDb.insert(stores).values({
      id: "foreign-store",
      organization_id: "tablecast-fixture-other-org",
      name: "他店舗",
      config_json: JSON.stringify(configuration),
      updated_at: Date.now(),
    }),
    fixtureDb.insert(posConnections).values({ ...before, id: "foreign", storeId: "foreign-store" }),
  ]);
  const draft = await createDraft(services, staff);
  await expect(
    updateDraft(services, staff, draft.id, {
      expectedVersion: 1,
      instructionFormatVersion: 1,
      configuration: {
        ...draft.configuration,
        pos: { ...posConfiguration.pos, connectionId: "foreign" },
      },
    }),
  ).rejects.toMatchObject({ code: "POS_CONNECTION_CONFLICT" });
});

it("保存済みinvoiceがあれば旧注文版に対応がなくても照会から一度だけ精算する", async () => {
  const { cookie, table, staff } = await setupPosFixture();
  const provider = squareHttp();
  expect(
    (
      await request(checkoutPath + "/start", cookie, "POST", {
        expectedVersion: table.cart.version,
        idempotencyKey: "tablecast-pos-frozen-legacy",
      })
    ).status,
  ).toBe(200);
  const frozen = (await fixtureDb.select().from(posCheckouts).get())?.invoiceJson;
  await fixtureDb.batch([
    fixtureDb
      .update(stores)
      .set({ config_json: JSON.stringify(configuration) })
      .where(eq(stores.id, staff.storeId)),
    fixtureDb
      .update(configReleases)
      .set({ config_json: JSON.stringify(configuration) })
      .where(eq(configReleases.store_id, staff.storeId)),
  ]);
  provider.state.completed = true;
  for (let index = 0; index < 2; index++) {
    const response = await request(checkoutPath + "/reconcile", cookie, "POST");
    expect(response.status).toBe(200);
    expect(posCheckoutViewSchema.parse(await response.json())).toMatchObject({
      checkout: { status: "completed" },
      invoice: { lines: [{ externalId: "square-tea" }] },
    });
  }
  expect((await fixtureDb.select().from(posCheckouts).get())?.invoiceJson).toBe(frozen);
  expect(await fixtureDb.select().from(payments)).toMatchObject([{ amount: 400 }]);
});
