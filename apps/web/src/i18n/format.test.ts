import { describe, expect, it } from "vitest";
import { dateTime, money, time } from "./format";

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
      japanese: "2026/12/31 23:59",
      english: "31 Dec 2026, 23:59",
    },
    {
      iso: "2026-12-31T15:00:00Z",
      japanese: "2027/01/01 0:00",
      english: "1 Jan 2027, 00:00",
    },
    {
      iso: "2026-06-30T15:05:00Z",
      japanese: "2026/07/01 0:05",
      english: "1 Jul 2026, 00:05",
    },
  ])("$isoの日付は店舗のtimezoneと日英の書式で表示する", ({ iso, japanese, english }) => {
    const value = new Date(iso);
    expect(dateTime(value, "ja")).toBe(japanese);
    expect(dateTime(value.getTime(), "en")).toBe(english);
    expect(dateTime(value, "ja")).toBe(japanese);
  });
});
