import { env, exports } from "cloudflare:workers";
import { expect, it } from "vitest";
import { createDraft, getDraft, publishDraft, validateDraft } from "../src/modules/configuration";
import { getCatalog, getEvents, prepareConfirmation, updateCart } from "../src/modules/operations";
import { tableStateSchema } from "../src/schema";
import { device, deviceToken, setupFixture } from "./fixture";

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
      "INSERT INTO stores(id,organization_id,name,config_json,updated_at) SELECT 'tablecast-other-store',organization_id,'別店舗',config_json,updated_at FROM stores WHERE id=?",
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
