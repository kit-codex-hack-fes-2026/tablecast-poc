import { describe, expect, it } from "vitest";
import { calendarDate, dateTime, money, relativeTime, time } from "./format";

describe("店舗の金額・日時表示", () => {
  it("日英とも日本円の整数と桁区切りを表示し、円記号を正規化する", () => {
    expect(money(0, "ja")).toBe("¥0");
    expect(money(1_234_567, "ja")).toBe("¥1,234,567");
    expect(money(-500, "ja")).toBe("-¥500");
    expect(money(0, "en")).toBe("JP¥0");
    expect(money(1_234_567, "en")).toBe("JP¥1,234,567");
    expect(money(-500, "en")).toBe("-JP¥500");
    expect(money(1_234_567, "ja")).toBe("¥1,234,567");
  });

  it.each(["ja", "en"] as const)("%sの時刻は店舗の年越しを24時間表記で扱う", (locale) => {
    expect(time(Date.parse("2026-12-31T14:59:00Z"), locale)).toBe("23:59");
    expect(time(Date.parse("2026-12-31T15:00:00Z"), locale)).toBe("00:00");
    expect(time(Date.parse("2026-06-30T15:05:00Z"), locale)).toBe("00:05");
  });

  it.each([
    {
      iso: "2026-12-31T14:59:00Z",
      japanese: "2026年12月31日(木) 23:59",
      english: "Thursday, 31 December 2026, 23:59",
    },
    {
      iso: "2026-12-31T15:00:00Z",
      japanese: "2027年1月1日(金) 00:00",
      english: "Friday, 1 January 2027, 00:00",
    },
    {
      iso: "2026-06-30T15:05:00Z",
      japanese: "2026年7月1日(水) 00:05",
      english: "Wednesday, 1 July 2026, 00:05",
    },
  ])("$isoの日付は店舗のtimezoneと日英の書式で表示する", ({ iso, japanese, english }) => {
    const value = new Date(iso);
    expect(dateTime(value, "ja")).toBe(japanese);
    expect(dateTime(value.getTime(), "en")).toBe(english);
    expect(dateTime(value, "ja")).toBe(japanese);
  });
});

it("日付キーは曜日と月名を含む自然な表記になりタイムゾーン略称を表示しない", () => {
  expect(calendarDate("2026-10-20", "ja")).toBe("2026年10月20日(火)");
  expect(calendarDate("2026-10-20", "en")).toBe("Tuesday, 20 October 2026");
});

it.each([
  [0, "今", "now"],
  [59_999, "59 秒前", "59 seconds ago"],
  [60_000, "1 分前", "1 minute ago"],
  [3_599_999, "59 分前", "59 minutes ago"],
  [3_600_000, "1 時間前", "1 hour ago"],
  [86_400_000, "昨日", "yesterday"],
  [172_800_000, "一昨日", "2 days ago"],
  [-1_000, "今", "now"],
])("経過%smsを日英の相対時刻で表示する", (elapsed, japanese, english) => {
  const now = Date.parse("2026-10-29T00:00:00Z");
  expect(relativeTime(now - elapsed, now, "ja")).toBe(japanese);
  expect(relativeTime(now - elapsed, now, "en")).toBe(english);
});
