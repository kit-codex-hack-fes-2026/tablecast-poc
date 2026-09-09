import { insertFixture } from "./database-fixture";
import * as businessTables from "../src/db/business-schema";
import * as authTables from "../src/db/auth-schema";
import { env, exports } from "cloudflare:workers";
import { expect, it } from "vitest";
import {
  changeOrderStatus,
  closeTable,
  getTableState,
  prepareConfirmation,
  recordPayment,
  submitOrder,
  updateCart,
} from "../src/modules/operations";
import {
  historyPageSchema,
  planSchema,
  sessionEventsPageSchema,
  tableStateSchema,
  type HistoryPage,
} from "../src/schema";
import { configuration, device, deviceToken, setupFixture, text } from "./fixture";

const base = "/api/admin/stores/tablecast-store";
const closedAt = 1_788_652_800_000;
function get(path: string, cookie: string) {
  return exports.default.fetch(
    new Request(`http://localhost:3000${path}`, { headers: { Cookie: cookie } }),
  );
}
function closedSession(
  id: string,
  time: number | null = closedAt,
  storeId = "tablecast-store",
  tableId = "tablecast-table",
) {
  return insertFixture(businessTables.tableSessions, {
    id,
    store_id: storeId,
    table_id: tableId,
    locale: "ja",
    status: "closed",
    guest_count: 2,
    opened_at: closedAt - 3_600_000,
    closed_at: time,
  });
}
async function history(path: string, cookie: string) {
  const response = await get(path, cookie);
  expect(response.status).toBe(200);
  return historyPageSchema.parse(await response.json());
}
async function eventPage(path: string, cookie: string) {
  const response = await get(path, cookie);
  expect(response.status).toBe(200);
  return sessionEventsPageSchema.parse(await response.json());
}

it("閉卓時刻が同じ来店をID順で欠落・重複なく辿り、途中の新規閉卓にもずれない", async () => {
  const { cookie } = await setupFixture();
  const ids = ["05", "04", "03", "02", "01"].map((suffix) => `tablecast-history-${suffix}`);
  await env.TABLECAST_DB.batch([
    ...ids.map((id) => closedSession(id)),
    closedSession("tablecast-older", closedAt - 1),
    closedSession("tablecast-no-close-time", null),
  ]);

  let page = await history(`${base}/history?limit=2`, cookie);
  expect(page.sessions.map((session) => session.id)).toEqual(ids.slice(0, 2));
  expect(page.nextCursor).toEqual({ closedAt, id: ids[1] });
  await closedSession("tablecast-newer", closedAt + 1).run();
  const sessions: HistoryPage["sessions"] = [...page.sessions];
  while (page.nextCursor) {
    const query = new URLSearchParams({
      limit: "2",
      beforeClosedAt: String(page.nextCursor.closedAt),
      beforeId: page.nextCursor.id,
    });
    page = await history(`${base}/history?${query.toString()}`, cookie);
    sessions.push(...page.sessions);
  }

  expect(sessions.map((session) => session.id)).toEqual([...ids, "tablecast-older"]);
  expect(sessions[0]).toMatchObject({
    tableId: "tablecast-table",
    tableName: "01",
    guestCount: 2,
    locale: "ja",
    openedAt: closedAt - 3_600_000,
    closedAt,
  });
  expect(sessions.every((session) => session.bill.due === 0)).toBe(true);
});

it("閉卓一覧の会計は取消・拒否を除き、確定プラン・調整・分割支払を詳細と同じ値で返す", async () => {
  const { cookie, staff } = await setupFixture();
  const rules = planSchema.parse({
    id: "tablecast-coffee-plan",
    text: text("ラテのプラン", "Latte plan"),
    pricePerPerson: 1800,
    durationMinutes: 90,
    lastOrderMinutesBeforeEnd: 10,
    productIds: ["coffee"],
    categoryIds: [],
    tags: [],
    maxPerOrder: 4,
    maxTotalPerPerson: 10,
    intervalSeconds: 30,
    excludedOptionIds: [],
    includedOptionSurcharge: true,
  });
  await env.TABLECAST_DB.prepare("UPDATE table_sessions SET plan_json=? WHERE id=?")
    .bind(JSON.stringify({ id: rules.id, startedAt: Date.now(), rules }), staff.tableSessionId)
    .run();
  for (const [index, status] of ["served", "cancelled", "rejected"].entries()) {
    const state = await getTableState(env, device);
    const cart = await updateCart(env, device, {
      expectedVersion: state.cart.version,
      lines: [{ id: "tea", productId: "tea", quantity: index + 1, selections: [] }],
    });
    const snapshot = await prepareConfirmation(env, device, {
      expectedVersion: cart.cart.version,
      channel: "gui",
    });
    const order = await submitOrder(env, device, {
      snapshotId: snapshot.id,
      idempotencyKey: `tablecast-history-order-${index}`,
      approved: true,
    });
    if (status === "served") {
      await changeOrderStatus(env, staff, order.id, "accepted");
      await changeOrderStatus(env, staff, order.id, "served");
    } else if (status === "cancelled" || status === "rejected") {
      await changeOrderStatus(env, staff, order.id, status);
    }
  }
  await recordPayment(env, staff, {
    kind: "adjustment",
    amount: -100,
    reason: "値引き",
    idempotencyKey: "tablecast-history-discount",
  });
  for (const amount of [1000, 2900]) {
    await recordPayment(env, staff, {
      kind: "payment",
      amount,
      reason: "模擬支払い",
      idempotencyKey: `tablecast-history-payment-${amount}`,
    });
  }
  const closed = await closeTable(env, staff);
  const changed = structuredClone(configuration);
  changed.products = changed.products.map((product) => ({ ...product, price: 9999 }));
  await env.TABLECAST_DB.prepare("UPDATE stores SET config_json=? WHERE id=?")
    .bind(JSON.stringify(changed), staff.storeId)
    .run();

  const page = await history(`${base}/history`, cookie);
  const detail = tableStateSchema.parse(
    await (await get(`${base}/tables/${closed.id}`, cookie)).json(),
  );

  expect(page.sessions).toHaveLength(1);
  expect(page.sessions[0]?.bill).toEqual({
    orderedTotal: 400,
    adjustmentTotal: -100,
    planTotal: 3600,
    paidTotal: 3900,
    due: 0,
    cartTotal: 0,
  });
  expect(page.sessions[0]?.bill).toEqual(detail.bill);
  expect(detail.status).toBe("closed");
});

it("100件を超える一来店のログを古い方向へ全件辿り、他卓と店舗全体のログを混ぜない", async () => {
  const { cookie } = await setupFixture();
  await closedSession("tablecast-history").run();
  await env.TABLECAST_DB.batch(
    Array.from({ length: 205 }, (_, index) =>
      insertFixture(businessTables.tableEvents, {
        store_id: "tablecast-store",
        table_session_id: "tablecast-history",
        kind: "voice.user",
        data_json: JSON.stringify({ text: `履歴 ${index}`, locale: "ja" }),
        created_at: closedAt - 205 + index,
      }),
    ),
  );
  await env.TABLECAST_DB.batch([
    insertFixture(businessTables.tableEvents, {
      store_id: "tablecast-store",
      table_session_id: "tablecast-session",
      kind: "voice.user",
      data_json: "{}",
      created_at: closedAt,
    }),
    insertFixture(businessTables.tableEvents, {
      store_id: "tablecast-store",
      table_session_id: null,
      kind: "configuration.published",
      data_json: "{}",
      created_at: closedAt,
    }),
  ]);
  const path = `${base}/tables/tablecast-history/events`;

  const first = await eventPage(path, cookie);
  expect(first.events).toHaveLength(100);
  expect(first.events[0]?.data.text).toBe("履歴 105");
  const second = await eventPage(`${path}?before=${first.nextBefore}`, cookie);
  expect(second.events).toHaveLength(100);
  const third = await eventPage(`${path}?before=${second.nextBefore}`, cookie);

  expect(third.events).toHaveLength(5);
  expect(third.nextBefore).toBeNull();
  const all = [...third.events, ...second.events, ...first.events];
  expect(all.map((event) => event.data.text)).toEqual(
    Array.from({ length: 205 }, (_, index) => `履歴 ${index}`),
  );
  expect(new Set(all.map((event) => event.cursor)).size).toBe(205);
  expect(all.every((event) => event.tableSessionId === "tablecast-history")).toBe(true);
  expect(
    (await eventPage(`${path}?limit=2`, cookie)).events.map((event) => event.data.text),
  ).toEqual(["履歴 203", "履歴 204"]);
  expect(await eventPage(`${path}?before=${all[0]?.cursor}`, cookie)).toEqual({
    events: [],
    nextBefore: null,
  });
});

it("認可した店舗の履歴だけを返し、別店舗IDの差替えと端末Cookieによる参照を拒否する", async () => {
  const { cookie } = await setupFixture();
  await env.TABLECAST_DB.batch([
    insertFixture(authTables.organization, {
      id: "tablecast-other-org",
      name: "別組織",
      slug: "tablecast-other",
      createdAt: new Date(closedAt),
    }),
    insertFixture(businessTables.stores, {
      id: "tablecast-other-store",
      organization_id: "tablecast-other-org",
      name: "別店舗",
      config_json: JSON.stringify(configuration),
      updated_at: closedAt,
    }),
    insertFixture(businessTables.restaurantTables, {
      id: "tablecast-other-table",
      store_id: "tablecast-other-store",
      name: "別卓",
    }),
    closedSession("tablecast-history"),
    closedSession(
      "tablecast-other-history",
      closedAt,
      "tablecast-other-store",
      "tablecast-other-table",
    ),
    insertFixture(businessTables.tableEvents, {
      store_id: "tablecast-other-store",
      table_session_id: "tablecast-other-history",
      kind: "voice.user",
      data_json: "{}",
      created_at: closedAt,
    }),
  ]);

  expect((await history(`${base}/history`, cookie)).sessions.map((session) => session.id)).toEqual([
    "tablecast-history",
  ]);
  for (const suffix of [
    "/history",
    "/tables/tablecast-other-history",
    "/tables/tablecast-other-history/events",
  ]) {
    expect((await get(`/api/admin/stores/tablecast-other-store${suffix}`, cookie)).status).toBe(
      403,
    );
  }
  for (const suffix of ["", "/events"]) {
    expect((await get(`${base}/tables/tablecast-other-history${suffix}`, cookie)).status).toBe(404);
  }
  for (const path of [
    `${base}/history`,
    `${base}/tables/tablecast-history`,
    `${base}/tables/tablecast-history/events`,
  ]) {
    expect((await get(path, `tablecast.device=${deviceToken}`)).status).toBe(401);
  }
});

it("店舗所属を取り消すと同じCookieでも履歴を再取得できない", async () => {
  const { cookie, staff } = await setupFixture();
  await env.TABLECAST_DB.batch([
    closedSession("tablecast-history"),
    env.TABLECAST_DB.prepare("UPDATE member SET role='member' WHERE user_id=?").bind(staff.userId),
  ]);
  const paths = [
    `${base}/history`,
    `${base}/tables/tablecast-history`,
    `${base}/tables/tablecast-history/events`,
  ];
  for (const path of paths) expect((await get(path, cookie)).status).toBe(200);
  await env.TABLECAST_DB.prepare("DELETE FROM member WHERE user_id=?").bind(staff.userId).run();
  for (const path of paths) expect((await get(path, cookie)).status).toBe(403);
});

it("欠けたカーソル・不正時刻・不正上限は空文字や重複queryを含めHTTP400にする", async () => {
  const { cookie } = await setupFixture();
  const invalid = [
    `${base}/history?beforeClosedAt=${closedAt}`,
    `${base}/history?beforeId=tablecast-history`,
    `${base}/history?beforeClosedAt=${closedAt}&beforeId=`,
    `${base}/history?beforeClosedAt=${closedAt}&beforeId=%20`,
    ...["", "NaN", "-1", "1.5", "1e3", "8640000000000001"].map(
      (time) => `${base}/history?beforeClosedAt=${time}&beforeId=tablecast-history`,
    ),
    ...["", "NaN", "-1", "0", "1.5", "9007199254740992"].map(
      (cursor) => `${base}/tables/tablecast-session/events?before=${cursor}`,
    ),
    ...["", "0", "-1", "101", "1.5", "NaN", "2&limit=3"].flatMap((limit) => [
      `${base}/history?limit=${limit}`,
      `${base}/tables/tablecast-session/events?limit=${limit}`,
    ]),
  ];

  for (const path of invalid) {
    const response = await get(path, cookie);
    expect({ path, status: response.status }).toEqual({ path, status: 400 });
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_INPUT" } });
  }
});

it("閉卓後の呼出し解決要求を拒否し、過去の卓状態とイベントを変更しない", async () => {
  const { cookie, staff } = await setupFixture();
  await closeTable(env, staff);
  const before = await getTableState(env, staff);

  const response = await exports.default.fetch(
    new Request(`http://localhost:3000${base}/tables/${before.id}/call/resolve`, {
      method: "POST",
      headers: { Cookie: cookie },
    }),
  );

  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: { code: "SESSION_STALE" } });
  expect(await getTableState(env, staff)).toEqual(before);
});
