import { insertFixture } from "./database-fixture";
import * as businessTables from "../src/db/business-schema";
import { env, exports } from "cloudflare:workers";
import { expect, it } from "vitest";
import { getTableState, openTable, updateCart } from "../src/modules/operations";
import { tableStateSchema } from "../src/schema";
import { device, setupFixture } from "./fixture";

it("開卓済みの卓への再要求を409にし、先行セッションとカートを維持する", async () => {
  const { cookie } = await setupFixture();
  await updateCart(env, device, {
    expectedVersion: 0,
    lines: [{ id: "tea", productId: "tea", quantity: 2, selections: [] }],
  });
  const before = await getTableState(env, device);

  const response = await exports.default.fetch(
    new Request("http://localhost:3000/api/admin/stores/tablecast-store/tables/open", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ tableId: "tablecast-table", guestCount: 8, locale: "en" }),
    }),
  );

  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: { code: "TABLE_CONFLICT" } });
  expect(await getTableState(env, device)).toEqual(before);
});

it("空卓の同時開卓は一方だけ成立し、セッションと開卓イベントを一つだけ作る", async () => {
  const { cookie } = await setupFixture();
  await insertFixture(businessTables.restaurantTables, {
    id: "tablecast-vacant-table",
    store_id: "tablecast-store",
    name: "02",
  }).run();
  const open = () =>
    exports.default.fetch(
      new Request("http://localhost:3000/api/admin/stores/tablecast-store/tables/open", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ tableId: "tablecast-vacant-table", guestCount: 3, locale: "ja" }),
      }),
    );

  const responses = await Promise.all([open(), open()]);

  expect(responses.map((response) => response.status).sort((left, right) => left - right)).toEqual([
    200, 409,
  ]);
  const succeeded = responses.find((response) => response.ok);
  if (!succeeded) throw new Error("成立した開卓応答がありません");
  const table = tableStateSchema.parse(await succeeded.json());
  expect(table.guestCount).toBe(3);
  expect(table.tableId).toBe("tablecast-vacant-table");
  expect(
    await env.TABLECAST_DB.prepare(
      "SELECT COUNT(*) AS count FROM table_sessions WHERE table_id='tablecast-vacant-table'",
    ).first("count"),
  ).toBe(1);
  expect(
    await env.TABLECAST_DB.prepare(
      "SELECT COUNT(*) AS count FROM table_events WHERE table_session_id=? AND kind='table.opened'",
    )
      .bind(table.id)
      .first("count"),
  ).toBe(1);
});

it("開卓イベント保存が途中で失敗したら新しいセッションも残さない", async () => {
  const { staff } = await setupFixture();
  await insertFixture(businessTables.restaurantTables, {
    id: "tablecast-vacant-table",
    store_id: "tablecast-store",
    name: "02",
  }).run();
  await env.TABLECAST_DB.exec(
    "CREATE TRIGGER tablecast_fail_open BEFORE INSERT ON table_events WHEN NEW.kind='table.opened' BEGIN SELECT RAISE(ABORT,'tablecast-test-open-failure'); END",
  );

  await expect(
    openTable(env, staff, { tableId: "tablecast-vacant-table", guestCount: 3, locale: "ja" }),
  ).rejects.toThrow("tablecast-test-open-failure");

  expect(
    await env.TABLECAST_DB.prepare(
      "SELECT COUNT(*) AS count FROM table_sessions WHERE table_id='tablecast-vacant-table'",
    ).first("count"),
  ).toBe(0);
  expect(
    await env.TABLECAST_DB.prepare(
      "SELECT COUNT(*) AS count FROM table_events WHERE kind='table.opened'",
    ).first("count"),
  ).toBe(0);
  expect((await getTableState(env, device)).id).toBe("tablecast-session");
});
