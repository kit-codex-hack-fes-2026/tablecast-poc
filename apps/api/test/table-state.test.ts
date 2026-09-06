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
    env.TABLECAST_DB.prepare(
      "INSERT INTO table_events(store_id,table_session_id,kind,data_json,created_at) VALUES(?,?,'table.opened','{}',?)",
    ).bind(device.storeId, device.tableSessionId, openedAt),
  ]);
  await requestBill(env, device);
  await resolveCall(env, staff);
  await env.TABLECAST_DB.batch(
    Array.from({ length: 100 }, (_, index) =>
      env.TABLECAST_DB.prepare(
        "INSERT INTO table_events(store_id,table_session_id,kind,data_json,created_at) VALUES(?,?,'voice.user','{}',?)",
      ).bind(device.storeId, device.tableSessionId, openedAt + 1000 + index),
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
    env.TABLECAST_DB.prepare(
      "INSERT INTO stores(id,organization_id,name,config_json,updated_at) VALUES('tablecast-other-store','tablecast-org','別店舗',?,?)",
    ).bind(JSON.stringify(configuration), Date.now()),
    env.TABLECAST_DB.prepare(
      "INSERT INTO table_sessions(id,store_id,table_id,status,locale,guest_count,opened_at,closed_at) VALUES('tablecast-past-session','tablecast-store','tablecast-table','closed','ja',2,?,?)",
    ).bind(Date.now() - 1000, Date.now()),
    env.TABLECAST_DB.prepare(
      "INSERT INTO table_events(store_id,table_session_id,kind,data_json,created_at) VALUES('tablecast-store','tablecast-past-session','bill.requested','{}',?)",
    ).bind(Date.now()),
    env.TABLECAST_DB.prepare(
      "INSERT INTO table_events(store_id,table_session_id,kind,data_json,created_at) VALUES('tablecast-other-store','tablecast-session','bill.requested','{}',?)",
    ).bind(Date.now()),
    env.TABLECAST_DB.prepare(
      "INSERT INTO table_events(store_id,table_session_id,kind,data_json,created_at) VALUES('tablecast-store',NULL,'bill.requested','{}',?)",
    ).bind(Date.now()),
    env.TABLECAST_DB.prepare(
      "INSERT INTO table_events(store_id,table_session_id,kind,data_json,created_at) VALUES('tablecast-store','tablecast-session','staff.called','{}',?)",
    ).bind(Date.now()),
  ]);

  const state = tableStateSchema.parse(await getTableState(env, device));

  expect(state).toMatchObject({ billRequested: false });
});
