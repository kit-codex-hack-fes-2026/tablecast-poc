import { env, exports } from "cloudflare:workers";
import { expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as businessTables from "../src/db/business-schema";
import { getCatalog } from "../src/modules/catalog/queries";
import {
  createDraft,
  getDraft,
  publishDraft,
  updateDraft,
  validateDraft,
} from "../src/modules/configuration/service";
import { prepareConfirmation, updateCart, submitOrder } from "../src/modules/orders/service";
import { getEvents } from "../src/modules/stores/queries";
import { createApiServices } from "../src/platform/context";
import {
  configDraftSchema,
  configurationIssueSchema,
  draftChoicesPageSchema,
  tableStateSchema,
} from "../src/schema";
import { insertFixture } from "./database-fixture";
import {
  device,
  deviceToken,
  configuration as fixtureConfiguration,
  setupFixture,
  text,
} from "./fixture";

const call = (url: string, auth: string, payload: unknown) =>
  exports.default.fetch(
    new Request(url, {
      method: "POST",
      headers: { Cookie: auth, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );

const table = async () =>
  tableStateSchema.parse(
    await (
      await exports.default.fetch(
        new Request("http://localhost:3000/api/table", {
          headers: { Cookie: `tablecast.device=${deviceToken}` },
        }),
      )
    ).json(),
  );

it("再開候補は小さな概要だけを返し、同じ更新時刻の31件目以降も重複なく取得できる", async () => {
  const { staff, cookie } = await setupFixture();
  const configuration = structuredClone(fixtureConfiguration);
  configuration.cast.proactive = !configuration.cast.proactive;
  const now = Date.now();
  await env.TABLECAST_DB.batch([
    ...Array.from({ length: 32 }, (_, index) =>
      insertFixture(businessTables.configDrafts, {
        id: `tablecast-choice-${String(index).padStart(2, "0")}`,
        store_id: staff.storeId,
        base_version: 1,
        version: index,
        status: index === 0 ? "ready" : "draft",
        config_json: JSON.stringify(configuration),
        created_by: staff.userId,
        created_at: now,
        updated_at: now,
      }),
    ),
    insertFixture(
      businessTables.configDrafts,
      ["published", "discarded"].map((status) => ({
        id: `tablecast-choice-${status}`,
        store_id: staff.storeId,
        base_version: 1,
        status: status === "published" ? "published" : "discarded",
        config_json: JSON.stringify(configuration),
        created_by: staff.userId,
        created_at: now,
        updated_at: now + 1,
      })),
    ),
  ]);
  const endpoint = `http://localhost:3000/api/admin/stores/${staff.storeId}/drafts/choices`;
  const first = await exports.default.fetch(new Request(endpoint, { headers: { Cookie: cookie } }));
  expect(first.status).toBe(200);
  const raw = await first.json();
  const page = draftChoicesPageSchema.parse(raw);
  expect(page.drafts).toHaveLength(30);
  expect(page.publishedVersion).toBe(1);
  expect(page.drafts[0]).toMatchObject({
    id: "tablecast-choice-31",
    changeCount: 1,
    sections: ["cast"],
  });
  expect(JSON.stringify(raw)).not.toContain("configuration");
  expect(JSON.stringify(raw)).not.toContain('before"');
  expect(JSON.stringify(raw).length).toBeLessThan(8000);
  expect(page.nextCursor).not.toBeNull();
  if (!page.nextCursor) throw new Error("続きの下書きが必要です");
  const nextQuery = new URLSearchParams({
    beforeUpdatedAt: String(page.nextCursor.beforeUpdatedAt),
    beforeId: page.nextCursor.beforeId,
  });
  const second = await exports.default.fetch(
    new Request(`${endpoint}?${nextQuery.toString()}`, { headers: { Cookie: cookie } }),
  );
  expect(second.status).toBe(200);
  const last = draftChoicesPageSchema.parse(await second.json());
  expect(last.drafts.map((draft) => draft.id)).toEqual([
    "tablecast-choice-01",
    "tablecast-choice-00",
  ]);
  expect(last.drafts[1]?.status).toBe("ready");
  expect(last.nextCursor).toBeNull();
  expect(new Set([...page.drafts, ...last.drafts].map((draft) => draft.id)).size).toBe(32);
});

it("下書き再開候補は未認証・他店舗アクセスと片方だけのカーソルを拒否する", async () => {
  const { cookie } = await setupFixture();
  for (const { path, headers, status } of [
    { path: "tablecast-store/drafts/choices", headers: {}, status: 401 },
    { path: "tablecast-other-store/drafts/choices", headers: { Cookie: cookie }, status: 403 },
    {
      path: "tablecast-store/drafts/choices?beforeId=tablecast-draft",
      headers: { Cookie: cookie },
      status: 400,
    },
  ]) {
    const response = await exports.default.fetch(
      new Request(`http://localhost:3000/api/admin/stores/${path}`, { headers }),
    );
    expect(response.status).toBe(status);
  }
});

it.each([
  { name: "追加", remove: false },
  { name: "削除", remove: true },
])(
  "商品・グループ・選択肢の$nameでは内包する価格と安全情報を重要な差分として返す",
  async ({ remove }) => {
    const { staff, cookie } = await setupFixture();
    const original = (await getCatalog(createApiServices(env), staff.storeId)).configuration;
    const extended = structuredClone(original);
    const tea = extended.products[0];
    const coffee = extended.products[1];
    const group = coffee?.modifiers[0];
    const option = group?.options[0];
    if (!tea || !coffee || !group || !option) throw new Error("設定fixtureがありません");
    extended.products.push({ ...tea, id: "new-tea" });
    coffee.modifiers.push({
      ...group,
      id: "new-group",
      options: [{ ...option, id: "new-option" }],
    });
    group.options.push({ ...option, id: "soy" });
    extended.categories.push({ id: "seasonal", text: text("季節限定", "Seasonal") });
    const before = remove ? extended : original;
    const after = remove ? original : extended;
    await env.TABLECAST_DB.prepare("UPDATE stores SET config_json=? WHERE id=?")
      .bind(JSON.stringify(before), staff.storeId)
      .run();
    const draft = await createDraft(createApiServices(env), staff);
    await updateDraft(createApiServices(env), staff, draft.id, {
      expectedVersion: draft.version,
      configuration: after,
    });

    const response = await exports.default.fetch(
      new Request(`http://localhost:3000/api/admin/stores/${staff.storeId}/drafts/${draft.id}`, {
        headers: { Cookie: cookie },
      }),
    );
    expect(response.status).toBe(200);
    const { changes } = configDraftSchema.parse(await response.json());
    expect(changes.map(({ path, sensitive }) => ({ path, sensitive }))).toEqual([
      { path: "categories.1", sensitive: false },
      { path: "products.1.modifiers.0.options.2", sensitive: true },
      { path: "products.1.modifiers.1", sensitive: true },
      { path: "products.2", sensitive: true },
    ]);
    for (const change of changes) {
      expect(remove ? change.after : change.before).toBeNull();
      expect(remove ? change.before : change.after).toEqual(expect.any(Object));
    }
    const productChange = changes.find(({ path }) => path === "products.2");
    expect(remove ? productChange?.before : productChange?.after).toEqual(extended.products[2]);
  },
);

it.each([
  { name: "参照不整合が残る", invalid: true },
  { name: "現在の規則では整合する", invalid: false },
])("旧形式の$name下書きを構造化して読み、版・未検証状態を変更しない", async ({ invalid }) => {
  const { staff, cookie } = await setupFixture();
  const created = await createDraft(createApiServices(env), staff);
  const configuration = structuredClone(created.configuration);
  if (invalid) {
    const product = configuration.products[0];
    if (!product) throw new Error("商品fixtureがありません");
    product.categoryId = "missing-category";
  }
  const draft = await updateDraft(createApiServices(env), staff, created.id, {
    expectedVersion: created.version,
    configuration,
  });
  const legacyErrors = JSON.stringify(["旧版の検証エラー: 固定文言の解析には依存しない"]);
  await env.TABLECAST_DB.prepare("UPDATE config_drafts SET errors_json=? WHERE id=?")
    .bind(legacyErrors, draft.id)
    .run();

  const response = await exports.default.fetch(
    new Request(`http://localhost:3000/api/admin/stores/${staff.storeId}/drafts/${draft.id}`, {
      headers: { Cookie: cookie },
    }),
  );
  expect(response.status).toBe(200);
  const read = configDraftSchema.parse(await response.json());
  expect(read.errors).toEqual(
    invalid
      ? [
          {
            code: "CATEGORY_NOT_FOUND",
            path: ["products", 0, "categoryId"],
            params: { categoryId: "missing-category" },
          },
        ]
      : [],
  );
  expect(read.status).toBe("draft");
  expect(read.version).toBe(draft.version);
  expect(
    await env.TABLECAST_DB.prepare(
      "SELECT status,version,errors_json FROM config_drafts WHERE id=?",
    )
      .bind(draft.id)
      .first(),
  ).toEqual({ status: "draft", version: draft.version, errors_json: legacyErrors });
  await expect(
    publishDraft(createApiServices(env), staff, draft.id, {
      expectedVersion: draft.version,
      baseVersion: draft.baseVersion,
      idempotencyKey: "tablecast-legacy-draft-publication",
      approved: true,
    }),
  ).rejects.toMatchObject({ code: invalid ? "DRAFT_INVALID" : "DRAFT_CONFLICT" });
  expect((await getCatalog(createApiServices(env), staff.storeId)).version).toBe(draft.baseVersion);

  const validated = await validateDraft(createApiServices(env), staff, draft.id, draft.version);
  expect(validated.errors).toEqual(read.errors);
  expect(validated.status).toBe(invalid ? "draft" : "ready");
  const persisted = await env.TABLECAST_DB.prepare(
    "SELECT errors_json FROM config_drafts WHERE id=?",
  )
    .bind(draft.id)
    .first<string>("errors_json");
  if (persisted === null) throw new Error("保存した下書きがありません");
  expect(configurationIssueSchema.array().parse(JSON.parse(persisted))).toEqual(validated.errors);
});

it("卓へ同店舗の公開版と更新通知だけを返し、管理metadata・他卓・他店舗を渡さない", async () => {
  const { staff } = await setupFixture();

  expect((await table()).configVersion).toBe(1);
  await env.TABLECAST_DB.batch([
    insertFixture(businessTables.stores, {
      id: "tablecast-other-store",
      organization_id: "tablecast-fixture-other-org",
      name: "別店舗",
      config_json: JSON.stringify(fixtureConfiguration),
      updated_at: Date.now(),
    }),
    insertFixture(businessTables.restaurantTables, {
      id: "tablecast-other-table",
      store_id: staff.storeId,
      name: "02",
    }),
    insertFixture(businessTables.tableSessions, {
      id: "tablecast-other-session",
      store_id: staff.storeId,
      table_id: "tablecast-other-table",
      locale: "ja",
      guest_count: 2,
      opened_at: Date.now(),
    }),
    insertFixture(businessTables.tableEvents, [
      {
        store_id: staff.storeId,
        table_session_id: device.tableSessionId,
        kind: "staff.called",
        data_json: "{}",
        created_at: Date.now(),
      },
      {
        store_id: staff.storeId,
        table_session_id: "tablecast-other-session",
        kind: "cart.updated",
        data_json: "{}",
        created_at: Date.now(),
      },
      {
        store_id: "tablecast-other-store",
        table_session_id: null,
        kind: "configuration.published",
        data_json: JSON.stringify({ actorId: "private-other-store" }),
        created_at: Date.now(),
      },
      {
        store_id: staff.storeId,
        table_session_id: null,
        kind: "staff.private",
        data_json: JSON.stringify({ actorId: "private-store-event" }),
        created_at: Date.now(),
      },
    ]),
  ]);
  const draft = await createDraft(createApiServices(env), staff);
  await validateDraft(createApiServices(env), staff, draft.id, draft.version);

  await publishDraft(createApiServices(env), staff, draft.id, {
    expectedVersion: draft.version,
    baseVersion: draft.baseVersion,
    idempotencyKey: "tablecast-visible-publication",
    approved: true,
  });

  const state = await table();
  expect(state.configVersion).toBe(2);
  expect(state.configVersion).toBe(
    (await getCatalog(createApiServices(env), staff.storeId)).version,
  );
  const received = await getEvents(createApiServices(env), device);
  expect(received.events.map((event) => event.kind)).toEqual([
    "staff.called",
    "configuration.published",
  ]);
  expect(received.events.map((event) => event.storeId)).toEqual([staff.storeId, staff.storeId]);
  expect(received.events[1]?.tableSessionId).toBeNull();
  expect(received.events[1]?.data).toEqual({});
  expect((await getEvents(createApiServices(env), device, received.cursor)).events).toEqual([]);
  const admin = await getEvents(createApiServices(env), { ...staff, tableSessionId: undefined });
  expect(admin.events.find((event) => event.kind === "configuration.published")?.data).toEqual({
    version: 2,
    draftId: draft.id,
    actorId: staff.userId,
  });
});

it("同じ公開要求が並行しても一度だけ公開し、両方へ同じ結果を返す", async () => {
  const { staff } = await setupFixture();
  const draft = await createDraft(createApiServices(env), staff);
  await validateDraft(createApiServices(env), staff, draft.id, draft.version);
  const input = {
    expectedVersion: draft.version,
    baseVersion: draft.baseVersion,
    idempotencyKey: "tablecast-concurrent-publication",
    approved: true as const,
  };

  const results = await Promise.all([
    publishDraft(createApiServices(env), staff, draft.id, input),
    publishDraft(createApiServices(env), staff, draft.id, input),
  ]);
  expect(results.map((result) => result.status)).toEqual(["published", "published"]);
  expect((await getCatalog(createApiServices(env), staff.storeId)).version).toBe(2);
  expect(
    await env.TABLECAST_DB.prepare("SELECT COUNT(*) AS count FROM config_releases").first("count"),
  ).toBe(1);
  expect(
    (
      await getEvents(createApiServices(env), { ...staff, tableSessionId: undefined })
    ).events.filter((event) => event.kind === "configuration.published"),
  ).toHaveLength(1);

  await updateCart(createApiServices(env), device, {
    expectedVersion: 0,
    lines: [{ id: "tea", productId: "tea", quantity: 1, selections: [] }],
  });
  const confirmation = await prepareConfirmation(createApiServices(env), device, {
    expectedVersion: 1,
    channel: "gui",
  });
  await publishDraft(createApiServices(env), staff, draft.id, input);
  expect(
    await env.TABLECAST_DB.prepare("SELECT status FROM confirmations WHERE id=?")
      .bind(confirmation.id)
      .first("status"),
  ).toBe("pending");
});

it.each([
  { name: "同じキーの別下書き", sameKey: true, code: "IDEMPOTENCY_CONFLICT" },
  { name: "異なるキーの同じ公開元版", sameKey: false, code: "DRAFT_CONFLICT" },
])("$nameが競合すると、一方だけ公開し他方から履歴を作らない", async ({ sameKey, code }) => {
  const { staff } = await setupFixture();
  const drafts = await Promise.all([
    createDraft(createApiServices(env), staff),
    createDraft(createApiServices(env), staff),
  ]);
  for (const draft of drafts)
    await validateDraft(createApiServices(env), staff, draft.id, draft.version);

  const results = await Promise.allSettled(
    drafts.map((draft, index) =>
      publishDraft(createApiServices(env), staff, draft.id, {
        expectedVersion: draft.version,
        baseVersion: draft.baseVersion,
        idempotencyKey: `tablecast-conflicting-publication-${sameKey ? "same" : index}`,
        approved: true,
      }),
    ),
  );
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const rejected = results.filter((result) => result.status === "rejected");
  expect(rejected).toHaveLength(1);
  for (const result of rejected) expect(result.reason).toMatchObject({ code });
  expect((await getCatalog(createApiServices(env), staff.storeId)).version).toBe(2);
  expect(
    await env.TABLECAST_DB.prepare("SELECT COUNT(*) AS count FROM config_releases").first("count"),
  ).toBe(1);
  expect(
    (
      await getEvents(createApiServices(env), { ...staff, tableSessionId: undefined })
    ).events.filter((event) => event.kind === "configuration.published"),
  ).toHaveLength(1);
  expect(
    await env.TABLECAST_DB.prepare(
      "SELECT COUNT(*) AS count FROM config_drafts WHERE status='ready' AND publish_key IS NULL",
    ).first("count"),
  ).toBe(1);
});

it("設定公開の途中失敗では公開版・下書き・履歴・既存確認をまとめて復元する", async () => {
  const { staff } = await setupFixture();
  await updateCart(createApiServices(env), device, {
    expectedVersion: 0,
    lines: [{ id: "tea", productId: "tea", quantity: 1, selections: [] }],
  });
  const confirmation = await prepareConfirmation(createApiServices(env), device, {
    expectedVersion: 1,
    channel: "gui",
  });
  const draft = await createDraft(createApiServices(env), staff);
  await validateDraft(createApiServices(env), staff, draft.id, draft.version);
  await env.TABLECAST_DB.exec(
    "CREATE TRIGGER tablecast_fail_publication BEFORE INSERT ON table_events WHEN NEW.kind='configuration.published' BEGIN SELECT RAISE(ABORT,'tablecast-test-publication-failure'); END",
  );

  await expect(
    publishDraft(createApiServices(env), staff, draft.id, {
      expectedVersion: draft.version,
      baseVersion: draft.baseVersion,
      idempotencyKey: "tablecast-failed-publication",
      approved: true,
    }),
  ).rejects.toThrow("tablecast-test-publication-failure");
  expect((await getCatalog(createApiServices(env), staff.storeId)).version).toBe(1);
  expect((await getDraft(createApiServices(env), staff, draft.id)).status).toBe("ready");
  expect(
    await env.TABLECAST_DB.prepare("SELECT COUNT(*) AS count FROM config_releases").first("count"),
  ).toBe(0);
  expect(
    await env.TABLECAST_DB.prepare("SELECT status FROM confirmations WHERE id=?")
      .bind(confirmation.id)
      .first("status"),
  ).toBe("pending");
});

it("画像フィールドがない旧公開設定を読み、下書きで選択肢画像を保存しても公開版を変えない", async () => {
  const { staff, cookie } = await setupFixture();
  const services = createApiServices(env);
  const legacy = {
    ...fixtureConfiguration,
    products: fixtureConfiguration.products.map((product) => ({
      ...product,
      modifiers: product.modifiers.map((group) => ({
        ...group,
        options: group.options.map((option) =>
          Object.fromEntries(
            Object.entries(option).filter(([key]) => !["imageKey", "imageKind"].includes(key)),
          ),
        ),
      })),
    })),
  };
  await services.db
    .update(businessTables.stores)
    .set({ config_json: JSON.stringify(legacy) })
    .where(eq(businessTables.stores.id, staff.storeId));
  const draft = await createDraft(services, staff);
  const option = draft.configuration.products[1]?.modifiers[0]?.options[0];
  if (!option) throw new Error("選択肢fixtureがありません");
  expect(option).toMatchObject({ imageKey: null, imageKind: "illustration" });
  option.imageKey = "tablecast/images/tablecast-milk.webp";
  option.imageKind = "photograph";

  const response = await exports.default.fetch(
    new Request(`http://localhost:3000/api/admin/stores/${staff.storeId}/drafts/${draft.id}`, {
      method: "PUT",
      headers: {
        Cookie: cookie,
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expectedVersion: draft.version, configuration: draft.configuration }),
    }),
  );
  expect(response.status).toBe(200);
  const saved = await getDraft(services, staff, draft.id);
  expect(saved.configuration.products[1]?.modifiers[0]?.options[0]).toEqual(option);
  const published = await getCatalog(services, staff.storeId);
  expect(published.configuration.products[1]?.modifiers[0]?.options[0]?.imageKey).toBeNull();
  expect(saved.version).toBe(draft.version + 1);
});

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
    { optionId: "dairy", relation: "requires", expression: { kind: "option", optionId: "oat" } },
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
