import type { DisplayCurrencyCode, Locale } from "@tablecast/api/schema";
import { displayCurrencyCodes, storeTimeZone } from "@tablecast/api/schema";
const locales = { ja: "ja-JP", en: "en-GB" };
const currencies = ["JPY", ...displayCurrencyCodes] as const;
const moneyFormat = new Map<string, Intl.NumberFormat>();
for (const locale of ["ja", "en"] as const) {
  for (const currency of currencies) {
    moneyFormat.set(
      `${locale}:${currency}`,
      new Intl.NumberFormat(locales[locale], { style: "currency", currency }),
    );
  }
}
const currencyNames = {
  ja: new Intl.DisplayNames([locales.ja], { type: "currency" }),
  en: new Intl.DisplayNames([locales.en], { type: "currency" }),
};
export const currencyName = (currency: DisplayCurrencyCode, locale: Locale) =>
  currencyNames[locale].of(currency) ?? currency;
export const currencySymbol = (currency: "JPY" | DisplayCurrencyCode) =>
  currency === "JPY"
    ? "¥"
    : (moneyFormat
        .get(`en:${currency}`)
        ?.formatToParts(0)
        .find((part) => part.type === "currency")?.value ?? currency);
export const yenRate = new Intl.NumberFormat(locales.en, {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 4,
});
const timeFormat = {
  ja: new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: storeTimeZone,
  }),
  en: new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: storeTimeZone,
  }),
};
const calendarFormat = {
  ja: new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    timeZone: storeTimeZone,
  }),
  en: new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: storeTimeZone,
  }),
};
/** ISOの日付キーは機械用のまま保持し、利用者には言語に沿った日付を表示する。 */
export function calendarDate(value: Date | number | string, locale: Locale) {
  const date = new Date(value);
  if (locale === "en") return calendarFormat.en.format(date);
  const parts = calendarFormat.ja.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}年${part("month")}月${part("day")}日(${part("weekday")})`;
}
// ICUの違いで全角円記号と半角円記号が入れ替わり、SSRの文字列が不一致になるのを防ぐ。
export const money = (
  value: number,
  locale: Locale,
  currency: "JPY" | DisplayCurrencyCode = "JPY",
) => moneyFormat.get(`${locale}:${currency}`)?.format(value).replace("￥", "¥") ?? String(value);
export const time = (value: number, locale: Locale) => timeFormat[locale].format(value);
export const dateTime = (value: Date | number, locale: Locale) =>
  `${calendarDate(value, locale)}${locale === "en" ? "," : ""} ${timeFormat[locale].format(value)}`;
