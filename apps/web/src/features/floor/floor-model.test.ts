import { expect, it } from "vitest";
import {
  compareFloorRows,
  floorSearchSchema,
  moveDate,
  storeDate,
  tableTimeLimit,
  visitPosition,
} from "./floor-model";

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

it("日末ちょうどの閉卓は翌日へ継続せず、利用中だけ継続を示す", () => {
  expect(visitPosition({ ...visit, closedAt: end }, start, end, end).continuesAfter).toBe(false);
  expect(visitPosition({ ...visit, closedAt: end + 1 }, start, end, end).continuesAfter).toBe(true);
  expect(
    visitPosition({ ...visit, status: "open", closedAt: null }, start, end, end).continuesAfter,
  ).toBe(true);
});

it("並べ替えは自然な卓番号順・数値順と昇降順を使う", () => {
  const rows = [
    { id: "t10", name: "T10", status: 3, duration: 2, guests: 2, due: 1000 },
    { id: "t2", name: "T2", status: 0, duration: 10, guests: 4, due: 900 },
  ];
  expect(
    rows.toSorted((a, b) => compareFloorRows(a, b, "table:asc", "ja")).map((row) => row.name),
  ).toEqual(["T2", "T10"]);
  expect(
    rows.toSorted((a, b) => compareFloorRows(a, b, "due:asc", "en")).map((row) => row.name),
  ).toEqual(["T2", "T10"]);
  expect(
    rows.toSorted((a, b) => compareFloorRows(a, b, "duration:desc", "ja")).map((row) => row.name),
  ).toEqual(["T2", "T10"]);
  expect(floorSearchSchema.parse({ sort: "hash:asc", zoom: "infinite", q: "T2" })).toMatchObject({
    sort: undefined,
    zoom: undefined,
    q: "T2",
  });
});

it("倍率の数値URLと旧URLを同じ表示へ復元し、範囲外・刻み外を受け付けない", () => {
  for (const [zoom, expected] of [
    ["10", 10],
    [120, 120],
    ["300", 300],
    ["compact", 50],
    ["overview", 50],
    ["normal", 100],
    ["detailed", 200],
  ] as const)
    expect(floorSearchSchema.parse({ zoom }).zoom).toBe(expected);
  for (const zoom of [0, 15, 310, "", "infinite", null, true])
    expect(floorSearchSchema.parse({ zoom }).zoom).toBeUndefined();
});

it("取得済みの時間制を開始時刻から計算し、終了・超過と未取得・無制限を区別する", () => {
  const plan = {
    id: "tablecast-time-plan",
    startedAt: start + 60_000,
    rules: {
      id: "tablecast-plan",
      text: {
        ja: { displayName: "90分", speechName: "90分", description: "", aliases: [] },
        en: { displayName: "90 minutes", speechName: "90 minutes", description: "", aliases: [] },
      },
      pricePerPerson: 2000,
      durationMinutes: 90,
      lastOrderMinutesBeforeEnd: 15,
      productIds: [],
      categoryIds: [],
      tags: [],
      maxPerOrder: 5,
      maxTotalPerPerson: 20,
      intervalSeconds: 0,
      excludedOptionIds: [],
      includedOptionSurcharge: false,
    },
  };
  const endsAt = start + 91 * 60_000;
  expect(tableTimeLimit(undefined, endsAt)).toEqual({ kind: "unknown" });
  expect(tableTimeLimit(null, endsAt)).toEqual({ kind: "unlimited" });
  expect(tableTimeLimit(plan, endsAt - 1)).toEqual({
    kind: "timed",
    endsAt,
    lastOrderAt: endsAt - 15 * 60_000,
    remainingMinutes: 1,
  });
  expect(tableTimeLimit(plan, endsAt)).toMatchObject({ kind: "timed", remainingMinutes: 0 });
  expect(tableTimeLimit(plan, endsAt + 1)).toMatchObject({ kind: "timed", remainingMinutes: -1 });
  expect(tableTimeLimit(plan, endsAt + 60_000)).toMatchObject({
    kind: "timed",
    remainingMinutes: -1,
  });
});
