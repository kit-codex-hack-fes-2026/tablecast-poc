import { env } from "cloudflare:workers";
import { afterEach, expect, it, vi } from "vitest";
import * as businessTables from "../src/db/business-schema";
import { getAdminState } from "../src/modules/stores/queries";
import { getTableState } from "../src/modules/tables/queries";
import { requestBill, resolveCall } from "../src/modules/tables/service";
import { createApiServices } from "../src/platform/context";
import { tableStateSchema } from "../src/schema";
import { insertFixture } from "./database-fixture";
import { configuration, device, setupFixture } from "./fixture";

afterEach(() => vi.restoreAllMocks());

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
  await requestBill(createApiServices(env), device);
  await resolveCall(createApiServices(env), staff);
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

  const state = tableStateSchema.parse(await getTableState(createApiServices(env), staff));

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

  const state = tableStateSchema.parse(await getTableState(createApiServices(env), device));

  expect(state).toMatchObject({ billRequested: false });
});

it("利用卓が増えてもフロアのDB問合せ数は増えず、個別取得と同じ状態を返す", async () => {
  // Given: 会計依頼済みの卓がある。
  const { staff } = await setupFixture();
  await requestBill(createApiServices(env), device);
  const prepare = vi.spyOn(env.TABLECAST_DB, "prepare");
  await getAdminState(createApiServices(env), staff);
  const singleTableQueries = prepare.mock.calls.length;
  prepare.mockClear();
  for (const index of [1, 2, 3]) {
    await env.TABLECAST_DB.batch([
      insertFixture(businessTables.restaurantTables, {
        id: `tablecast-performance-table-${index}`,
        store_id: device.storeId,
        name: `T${index}`,
      }),
      insertFixture(businessTables.tableSessions, {
        id: `tablecast-performance-session-${index}`,
        store_id: device.storeId,
        table_id: `tablecast-performance-table-${index}`,
        locale: "ja",
        guest_count: 2,
        opened_at: Date.now(),
      }),
    ]);
  }
  prepare.mockClear();
  // When: 卓数を増やして店舗全体を取得する。
  const floor = await getAdminState(createApiServices(env), staff);
  const multipleTableQueries = prepare.mock.calls.length;
  // Then: 問合せ数は一定で、業務状態・会計・履歴は個別取得と一致する。
  expect(floor.tables).toHaveLength(4);
  expect(multipleTableQueries).toBe(singleTableQueries);
  for (const table of floor.tables) {
    expect(table).toEqual(
      await getTableState(createApiServices(env), { ...staff, tableSessionId: table.id }),
    );
  }
});
