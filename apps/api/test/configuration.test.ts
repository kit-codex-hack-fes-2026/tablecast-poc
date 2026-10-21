import { env, exports } from "cloudflare:workers";
import { expect, it } from "vitest";
import * as businessTables from "../src/db/business-schema";
import { getCatalog } from "../src/modules/catalog/queries";
import { getDraft } from "../src/modules/configuration/queries";
import { createDraft, validateDraft } from "../src/modules/configuration/use-cases/drafts";
import { publishDraft } from "../src/modules/configuration/use-cases/publish";
import { updateCart } from "../src/modules/orders/use-cases/cart";
import { prepareConfirmation } from "../src/modules/orders/use-cases/confirmation";
import { getEvents } from "../src/modules/stores/queries";
import { createApiServices } from "../src/platform/context";
import { tableStateSchema } from "../src/schema";
import { insertFixture } from "./database-fixture";
import {
  device,
  deviceToken,
  configuration as fixtureConfiguration,
  setupFixture,
} from "./fixture";

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
