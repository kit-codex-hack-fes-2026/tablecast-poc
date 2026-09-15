import { expect, it } from "vitest";
import { floorSearchSchema, moveDate, storeDate, visitPosition } from "./floor-model";

const start = Date.parse("2026-09-15T00:00:00+09:00");
const end = start + 86_400_000;
const visit = {
  id: "visit",
  tableId: "table",
  guestCount: 2,
  status: "closed" as const,
  openedAt: start - 1000,
  closedAt: end + 1000,
};

it("店舗日を端末の現地時刻から切り離し、月末・うるう日の移動を保つ", () => {
  expect(storeDate(start - 1)).toBe("2026-09-14");
  expect(storeDate(start)).toBe("2026-09-15");
  expect(moveDate("2024-03-01", -1)).toBe("2024-02-29");
  expect(moveDate("2026-12-31", 1)).toBe("2027-01-01");
  expect(floorSearchSchema.parse({ date: "2026-02-30", view: "unknown" })).toEqual({
    date: undefined,
    view: undefined,
  });
});

it("日跨ぎを表示範囲で切り、利用中は現在時刻まで描く", () => {
  expect(visitPosition(visit, start, end, start)).toEqual({
    left: 0,
    width: 100,
    continuesBefore: true,
    continuesAfter: true,
  });
  expect(
    visitPosition(
      { ...visit, status: "open", openedAt: start, closedAt: null },
      start,
      end,
      start + 43_200_000,
    ),
  ).toEqual({ left: 0, width: 50, continuesBefore: false, continuesAfter: false });
});

it("ゼロ時間・現在時刻より後の来店に架空の幅を与えない", () => {
  expect(
    visitPosition({ ...visit, openedAt: start, closedAt: start }, start, end, start).width,
  ).toBe(0);
  expect(
    visitPosition(
      { ...visit, status: "open", openedAt: start + 60_000, closedAt: null },
      start,
      end,
      start,
    ).width,
  ).toBe(0);
});
