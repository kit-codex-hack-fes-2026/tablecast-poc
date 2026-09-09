import { insertFixture } from "./database-fixture";
import * as businessTables from "../src/db/business-schema";
import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { getTableState, requestBill, resolveCall } from "../src/modules/operations";
import { tableStateSchema } from "../src/schema";
import { configuration, device, setupFixture } from "./fixture";

it("開卓・会計依頼が最新100件の表示ログから外れても開始時刻と依頼済み状態を維持する", async () => {
  const { staff } = await setupFixture();
  const openedAt = 1_788_600_000_000;
  await env.TABLECAST_DB.batch([
    env.TABLECAST_DB.prepare("UPDATE table_sessions SET opened_at=? WHERE id=?").bind(
      openedAt,
      device.tableSessionId,
    ),
    insertFixture(businessTables.tableEvents, {
      store_id: device.storeId,
      table_session_id: device.tableSessionId,
      kind: "table.opened",
      data_json: "{}",
      created_at: openedAt,
    }),
  ]);
  await requestBill(env, device);
  await resolveCall(env, staff);
  await env.TABLECAST_DB.batch(
    Array.from({ length: 100 }, (_, index) =>
      insertFixture(businessTables.tableEvents, {
        store_id: device.storeId,
        table_session_id: device.tableSessionId,
        kind: "voice.user",
        data_json: "{}",
        created_at: openedAt + 1000 + index,
      }),
    ),
  );

  const state = tableStateSchema.parse(await getTableState(env, staff));

  expect(state.events).toHaveLength(100);
  expect(
    state.events.some((event) => ["table.opened", "bill.requested"].includes(event.kind)),
  ).toBe(false);
  expect(state).toMatchObject({ openedAt, billRequested: true, staffCalled: false });
});

it("未依頼の卓は別来店・別店舗・店舗全体の会計依頼やスタッフ呼出しを自卓の依頼としない", async () => {
  await setupFixture();
  await env.TABLECAST_DB.batch([
    insertFixture(businessTables.stores, {
      id: "tablecast-other-store",
      organization_id: "tablecast-fixture-other-org",
      name: "別店舗",
      config_json: JSON.stringify(configuration),
      updated_at: Date.now(),
    }),
    insertFixture(businessTables.tableSessions, {
      id: "tablecast-past-session",
      store_id: "tablecast-store",
      table_id: "tablecast-table",
      status: "closed",
      locale: "ja",
      guest_count: 2,
      opened_at: Date.now() - 1000,
      closed_at: Date.now(),
    }),
    insertFixture(businessTables.tableEvents, {
      store_id: "tablecast-store",
      table_session_id: "tablecast-past-session",
      kind: "bill.requested",
      data_json: "{}",
      created_at: Date.now(),
    }),
    insertFixture(businessTables.tableEvents, {
      store_id: "tablecast-other-store",
      table_session_id: "tablecast-session",
      kind: "bill.requested",
      data_json: "{}",
      created_at: Date.now(),
    }),
    insertFixture(businessTables.tableEvents, {
      store_id: "tablecast-store",
      table_session_id: null,
      kind: "bill.requested",
      data_json: "{}",
      created_at: Date.now(),
    }),
    insertFixture(businessTables.tableEvents, {
      store_id: "tablecast-store",
      table_session_id: "tablecast-session",
      kind: "staff.called",
      data_json: "{}",
      created_at: Date.now(),
    }),
  ]);

  const state = tableStateSchema.parse(await getTableState(env, device));

  expect(state).toMatchObject({ billRequested: false });
});
