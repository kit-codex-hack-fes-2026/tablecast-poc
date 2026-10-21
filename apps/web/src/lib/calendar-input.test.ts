import { expect, it } from "vitest";
import {
  calendarInputValue,
  calendarKeyDate,
  dateKey,
  parseCalendarInput,
  validClock,
} from "./calendar-input";

it.each([
  ["2026年10月21日(水)", "ja", "2026-10-21"],
  ["2024年2月29日", "ja", "2024-02-29"],
  ["2026-10-21", "ja", "2026-10-21"],
  ["Wednesday, 21 October 2026", "en", "2026-10-21"],
  ["21/10/2026", "en", "2026-10-21"],
  ["21 october 2026", "en", "2026-10-21"],
] as const)("%sを曖昧な日時parseに依存せず日付キーへ変換する", (input, locale, expected) => {
  expect(parseCalendarInput(input, locale)).toBe(expected);
  expect(parseCalendarInput(calendarInputValue(expected, locale), locale)).toBe(expected);
});
it.each([
  "2026-02-29",
  "2026-02-30",
  "2026-04-31",
  "2026-13-01",
  "0000-01-01",
  "10000-01-01",
  "2026-10-00",
])("存在しない日付%sを繰り上げない", (input) => {
  expect(parseCalendarInput(input, "en")).toBeUndefined();
});
it("日英の混在や曖昧な短縮年・月を受け入れない", () => {
  expect(parseCalendarInput("21/10/26", "en")).toBeUndefined();
  expect(parseCalendarInput("10/21/2026", "en")).toBeUndefined();
  expect(parseCalendarInput("21 Oct 2026", "en")).toBeUndefined();
  expect(parseCalendarInput("2026年10月21日", "en")).toBeUndefined();
  expect(dateKey(2026.5, 10, 21)).toBeUndefined();
});
it("年と月の移動は閏日と月末を該当月の末日へ制限する", () => {
  expect(calendarKeyDate("2024-02-29", "PageDown", true)).toBe("2025-02-28");
  expect(calendarKeyDate("2026-01-31", "PageDown")).toBe("2026-02-28");
  expect(calendarKeyDate("2026-10-21", "ArrowDown")).toBe("2026-10-28");
  expect(calendarKeyDate("2026-10-21", "Home")).toBe("2026-10-18");
  expect(calendarKeyDate("2026-10-21", "End")).toBe("2026-10-24");
  expect(calendarKeyDate("0001-01-01", "PageUp")).toBeUndefined();
});
it.each(["24:00", "23:60", "25:30", "12:1", "1:30", "ab:cd"])("時刻%sを繰り上げない", (input) => {
  expect(validClock(input)).toBe(false);
});
it("00:00と23:59を許可する", () => {
  expect(validClock("00:00")).toBe(true);
  expect(validClock("23:59")).toBe(true);
});
