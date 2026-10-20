import type { Locale } from "@tablecast/api/schema";

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** 入力に使う日付だけを扱う。存在しない日付を翌月へ繰り上げない。 */
export function dateKey(year: number, month: number, day: number): string | undefined {
  if (![year, month, day].every(Number.isInteger) || year < 1 || year > 9999) return undefined;
  const value = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    return undefined;
  return value;
}

export function parseCalendarInput(input: string, locale: Locale): string | undefined {
  const text = input.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (iso) return dateKey(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  if (locale === "ja") {
    const japanese =
      /^(\d{1,4})年\s*(\d{1,2})月\s*(\d{1,2})日(?:[（(][日月火水木金土](?:曜日)?[）)])?$/.exec(
        text,
      );
    return japanese
      ? dateKey(Number(japanese[1]), Number(japanese[2]), Number(japanese[3]))
      : undefined;
  }
  const numeric = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (numeric) return dateKey(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));
  const english =
    /^(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+)?(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i.exec(
      text,
    );
  if (!english) return undefined;
  return dateKey(
    Number(english[3]),
    months.findIndex((month) => month.toLowerCase() === english[2].toLowerCase()) + 1,
    Number(english[1]),
  );
}

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
  timeZone: "UTC",
});
const weekdayFormat = new Intl.DateTimeFormat("ja-JP", { weekday: "short", timeZone: "UTC" });
export function calendarInputValue(value: string, locale: Locale): string {
  if (!parseCalendarInput(value, "en")) return "";
  const date = new Date(`${value}T00:00:00Z`);
  if (locale === "en") return dateFormat.format(date);
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日(${weekdayFormat.format(date)})`;
}

export function validClock(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function shiftCalendarDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split("T")[0];
}

export function calendarKeyDate(date: string, key: string, shift = false): string | undefined {
  const current = new Date(`${date}T00:00:00Z`);
  const offsets: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -7,
    ArrowDown: 7,
  };
  if (key === "Home") return shiftCalendarDate(date, -current.getUTCDay());
  if (key === "End") return shiftCalendarDate(date, 6 - current.getUTCDay());
  if (offsets[key] !== undefined) return shiftCalendarDate(date, offsets[key]);
  if (key !== "PageUp" && key !== "PageDown") return undefined;
  const direction = key === "PageUp" ? -1 : 1;
  const target = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
  target.setUTCMonth(target.getUTCMonth() + direction * (shift ? 12 : 1));
  const last = new Date(target);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  return dateKey(
    target.getUTCFullYear(),
    target.getUTCMonth() + 1,
    Math.min(current.getUTCDate(), last.getUTCDate()),
  );
}
