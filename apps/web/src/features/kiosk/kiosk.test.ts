import { describe, expect, it } from "vitest";
import { table as tablecastTableState } from "../../test-support/tablecast-fixtures";
import { affectedTableQueries, latestTable } from "./table-cache";

describe("卓の画面状態の応答順序", () => {
  it("Agentの商品ページ選択後に届く古い応答では画面を巻き戻さない", () => {
    const current = { ...tablecastTableState, cursor: 12, selectedProductId: "tablecast-product" };
    const stale = { ...tablecastTableState, cursor: 11, selectedProductId: null };
    expect(latestTable(current, stale)).toBe(current);
    expect(latestTable(stale, current)).toBe(current);
  });
});

it("coreの自己更新が進んでも別端末の履歴変更を取りこぼさず、自己注文では再取得しない", () => {
  const core = { ...tablecastTableState, cursor: 20 };
  const event = {
    cursor: 19,
    kind: "order.submitted",
    storeId: core.storeId,
    tableSessionId: core.id,
    data: { orderId: "tablecast-order" },
    createdAt: 0,
  };
  expect(affectedTableQueries([event], core, { cursor: 10, orders: [], nextCursor: null })).toEqual(
    { core: false, orders: true },
  );
  const snapshot = tablecastTableState.snapshot;
  const line = tablecastTableState.cart.lines[0];
  if (!line) throw new Error("注文行が必要です");
  const order = {
    id: "tablecast-order",
    tableSessionId: core.id,
    snapshotId: "tablecast-snapshot",
    idempotencyKey: "tablecast-order",
    status: "submitted" as const,
    total: 0,
    createdAt: 0,
    snapshot: snapshot ?? {
      id: "tablecast-snapshot",
      tableSessionId: core.id,
      cartVersion: 1,
      configVersion: 1,
      lines: [line],
      total: 0,
      locale: "ja" as const,
      text: "確認",
      expiresAt: 1000,
      channel: "gui" as const,
      status: "submitted" as const,
      createdTurnId: null,
      plan: null,
    },
  };
  expect(
    affectedTableQueries([event], core, { cursor: 10, orders: [order], nextCursor: null }),
  ).toEqual({ core: false, orders: false });
  expect(
    affectedTableQueries(
      [{ ...event, kind: "order.status", data: { orderId: order.id, status: "served" } }],
      core,
      { cursor: 10, orders: [order], nextCursor: null },
    ).orders,
  ).toBe(true);
});
