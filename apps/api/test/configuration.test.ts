import { env, exports } from "cloudflare:workers";
import { expect, it } from "vitest";
import {
  createDraft,
  getDraft,
  publishDraft,
  updateDraft,
  validateDraft,
} from "../src/modules/configuration";
import { getCatalog, getEvents, prepareConfirmation, updateCart } from "../src/modules/operations";
import { configDraftSchema, configurationIssueSchema, tableStateSchema } from "../src/schema";
import { device, deviceToken, setupFixture, text } from "./fixture";

it.each([
  { name: "追加", remove: false },
  { name: "削除", remove: true },
])(
  "商品・グループ・選択肢の$nameでは内包する価格と安全情報を重要な差分として返す",
  async ({ remove }) => {
    const { staff, cookie } = await setupFixture();
    const original = (await getCatalog(env, staff.storeId)).configuration;
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
    const draft = await createDraft(env, staff);
    await updateDraft(env, staff, draft.id, {
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
  const created = await createDraft(env, staff);
  const configuration = structuredClone(created.configuration);
  if (invalid) {
    const product = configuration.products[0];
    if (!product) throw new Error("商品fixtureがありません");
    product.categoryId = "missing-category";
  }
  const draft = await updateDraft(env, staff, created.id, {
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
    publishDraft(env, staff, draft.id, {
      expectedVersion: draft.version,
      baseVersion: draft.baseVersion,
      idempotencyKey: "tablecast-legacy-draft-publication",
      approved: true,
    }),
  ).rejects.toMatchObject({ code: invalid ? "DRAFT_INVALID" : "DRAFT_CONFLICT" });
  expect((await getCatalog(env, staff.storeId)).version).toBe(draft.baseVersion);

  const validated = await validateDraft(env, staff, draft.id, draft.version);
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
  expect((await table()).configVersion).toBe(1);
  await env.TABLECAST_DB.batch([
    env.TABLECAST_DB.prepare(
      "INSERT INTO stores(id,organization_id,name,config_json,updated_at) SELECT 'tablecast-other-store','tablecast-fixture-other-org','別店舗',config_json,updated_at FROM stores WHERE id=?",
    ).bind(staff.storeId),
    env.TABLECAST_DB.prepare(
      "INSERT INTO restaurant_tables(id,store_id,name) VALUES('tablecast-other-table',?,'02')",
    ).bind(staff.storeId),
    env.TABLECAST_DB.prepare(
      "INSERT INTO table_sessions(id,store_id,table_id,locale,guest_count,opened_at) VALUES('tablecast-other-session',?,'tablecast-other-table','ja',2,?)",
    ).bind(staff.storeId, Date.now()),
    env.TABLECAST_DB.prepare(
      "INSERT INTO table_events(store_id,table_session_id,kind,data_json,created_at) VALUES(?,?,'staff.called','{}',?),(?,'tablecast-other-session','cart.updated','{}',?),('tablecast-other-store',NULL,'configuration.published','{\"actorId\":\"private-other-store\"}',?),(?,NULL,'staff.private','{\"actorId\":\"private-store-event\"}',?)",
    ).bind(
      staff.storeId,
      device.tableSessionId,
      Date.now(),
      staff.storeId,
      Date.now(),
      Date.now(),
      staff.storeId,
      Date.now(),
    ),
  ]);
  const draft = await createDraft(env, staff);
  await validateDraft(env, staff, draft.id, draft.version);

  await publishDraft(env, staff, draft.id, {
    expectedVersion: draft.version,
    baseVersion: draft.baseVersion,
    idempotencyKey: "tablecast-visible-publication",
    approved: true,
  });

  const state = await table();
  expect(state.configVersion).toBe(2);
  expect(state.configVersion).toBe((await getCatalog(env, staff.storeId)).version);
  const received = await getEvents(env, device);
  expect(received.events.map((event) => event.kind)).toEqual([
    "staff.called",
    "configuration.published",
  ]);
  expect(received.events.map((event) => event.storeId)).toEqual([staff.storeId, staff.storeId]);
  expect(received.events[1]?.tableSessionId).toBeNull();
  expect(received.events[1]?.data).toEqual({});
  expect((await getEvents(env, device, received.cursor)).events).toEqual([]);
  const admin = await getEvents(env, { ...staff, tableSessionId: undefined });
  expect(admin.events.find((event) => event.kind === "configuration.published")?.data).toEqual({
    version: 2,
    draftId: draft.id,
    actorId: staff.userId,
  });
});

it("同じ公開要求が並行しても一度だけ公開し、両方へ同じ結果を返す", async () => {
  const { staff } = await setupFixture();
  const draft = await createDraft(env, staff);
  await validateDraft(env, staff, draft.id, draft.version);
  const input = {
    expectedVersion: draft.version,
    baseVersion: draft.baseVersion,
    idempotencyKey: "tablecast-concurrent-publication",
    approved: true as const,
  };

  const results = await Promise.all([
    publishDraft(env, staff, draft.id, input),
    publishDraft(env, staff, draft.id, input),
  ]);
  expect(results.map((result) => result.status)).toEqual(["published", "published"]);
  expect((await getCatalog(env, staff.storeId)).version).toBe(2);
  expect(
    await env.TABLECAST_DB.prepare("SELECT COUNT(*) AS count FROM config_releases").first("count"),
  ).toBe(1);
  expect(
    (await getEvents(env, { ...staff, tableSessionId: undefined })).events.filter(
      (event) => event.kind === "configuration.published",
    ),
  ).toHaveLength(1);

  await updateCart(env, device, {
    expectedVersion: 0,
    lines: [{ id: "tea", productId: "tea", quantity: 1, selections: [] }],
  });
  const confirmation = await prepareConfirmation(env, device, {
    expectedVersion: 1,
    channel: "gui",
  });
  await publishDraft(env, staff, draft.id, input);
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
  const drafts = await Promise.all([createDraft(env, staff), createDraft(env, staff)]);
  for (const draft of drafts) await validateDraft(env, staff, draft.id, draft.version);

  const results = await Promise.allSettled(
    drafts.map((draft, index) =>
      publishDraft(env, staff, draft.id, {
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
  expect((await getCatalog(env, staff.storeId)).version).toBe(2);
  expect(
    await env.TABLECAST_DB.prepare("SELECT COUNT(*) AS count FROM config_releases").first("count"),
  ).toBe(1);
  expect(
    (await getEvents(env, { ...staff, tableSessionId: undefined })).events.filter(
      (event) => event.kind === "configuration.published",
    ),
  ).toHaveLength(1);
  expect(
    await env.TABLECAST_DB.prepare(
      "SELECT COUNT(*) AS count FROM config_drafts WHERE status='ready' AND publish_key IS NULL",
    ).first("count"),
  ).toBe(1);
});

it("設定公開の途中失敗では公開版・下書き・履歴・既存確認をまとめて復元する", async () => {
  const { staff } = await setupFixture();
  await updateCart(env, device, {
    expectedVersion: 0,
    lines: [{ id: "tea", productId: "tea", quantity: 1, selections: [] }],
  });
  const confirmation = await prepareConfirmation(env, device, {
    expectedVersion: 1,
    channel: "gui",
  });
  const draft = await createDraft(env, staff);
  await validateDraft(env, staff, draft.id, draft.version);
  await env.TABLECAST_DB.exec(
    "CREATE TRIGGER tablecast_fail_publication BEFORE INSERT ON table_events WHEN NEW.kind='configuration.published' BEGIN SELECT RAISE(ABORT,'tablecast-test-publication-failure'); END",
  );

  await expect(
    publishDraft(env, staff, draft.id, {
      expectedVersion: draft.version,
      baseVersion: draft.baseVersion,
      idempotencyKey: "tablecast-failed-publication",
      approved: true,
    }),
  ).rejects.toThrow("tablecast-test-publication-failure");
  expect((await getCatalog(env, staff.storeId)).version).toBe(1);
  expect((await getDraft(env, staff, draft.id)).status).toBe("ready");
  expect(
    await env.TABLECAST_DB.prepare("SELECT COUNT(*) AS count FROM config_releases").first("count"),
  ).toBe(0);
  expect(
    await env.TABLECAST_DB.prepare("SELECT status FROM confirmations WHERE id=?")
      .bind(confirmation.id)
      .first("status"),
  ).toBe("pending");
});
