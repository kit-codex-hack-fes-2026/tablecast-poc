import { describe, expect, it } from "vitest";
import { table as tablecastTableState } from "../../../.storybook/tablecast-fixtures";
import { latestTable } from "./kiosk";

describe("卓の画面状態の応答順序", () => {
  it("Agentの商品ページ選択後に届く古い応答では画面を巻き戻さない", () => {
    const current = { ...tablecastTableState, cursor: 12, selectedProductId: "tablecast-product" };
    const stale = { ...tablecastTableState, cursor: 11, selectedProductId: null };
    expect(latestTable(current, stale)).toBe(current);
    expect(latestTable(stale, current)).toBe(current);
  });
});
