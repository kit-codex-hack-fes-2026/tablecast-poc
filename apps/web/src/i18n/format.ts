import type { DisplayCurrencyCode, Locale } from "@tablecast/api/schema";
import { resolveLocalized, uiLocale } from "@tablecast/api/localization";
import { displayCurrencyCodes, storeTimeZone } from "@tablecast/api/schema";
const locales = { ja: "ja-JP", en: "en-GB", "zh-Hans": "zh-Hans", ko: "ko-KR" };
const currencies = ["JPY", ...displayCurrencyCodes] as const;
const moneyFormat = new Map<string, Intl.NumberFormat>();
for (const locale of ["ja", "en", "zh-Hans", "ko"] as const) {
  for (const currency of currencies) {
    moneyFormat.set(
      `${locale}:${currency}`,
      new Intl.NumberFormat(locales[locale], { style: "currency", currency }),
    );
  }
}
const currencyNames: { [language: string]: Intl.DisplayNames; ja: Intl.DisplayNames } = {
  ja: new Intl.DisplayNames([locales.ja], { type: "currency" }),
};
for (const language of ["en", "zh-Hans", "ko"] as const)
  currencyNames[language] = new Intl.DisplayNames([locales[language]], { type: "currency" });
export const currencyName = (currency: DisplayCurrencyCode, locale: Locale) =>
  resolveLocalized(currencyNames, uiLocale(locale)).of(currency) ?? currency;
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
const timeFormat: { [language: string]: Intl.DateTimeFormat; ja: Intl.DateTimeFormat } = {
  ja: new Intl.DateTimeFormat(locales.ja, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: storeTimeZone,
  }),
};
const calendarFormat: { [language: string]: Intl.DateTimeFormat; ja: Intl.DateTimeFormat } = {
  ja: new Intl.DateTimeFormat(locales.ja, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    timeZone: storeTimeZone,
  }),
};
for (const language of ["en", "zh-Hans", "ko"] as const) {
  timeFormat[language] = new Intl.DateTimeFormat(locales[language], {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: storeTimeZone,
  });
  calendarFormat[language] = new Intl.DateTimeFormat(locales[language], {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: storeTimeZone,
  });
}
/** ISOの日付キーは機械用のまま保持し、利用者には言語に沿った日付を表示する。 */
export function calendarDate(value: Date | number | string, locale: Locale) {
  const date = new Date(value);
  // ICUの版による曜日後の読点の差を持ち込まず、SSRとブラウザーで同じ書式を使う。
  const parts = resolveLocalized(calendarFormat, uiLocale(locale)).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  if (uiLocale(locale) === "zh-Hans" || uiLocale(locale) === "ko")
    return resolveLocalized(calendarFormat, uiLocale(locale)).format(date);
  return uiLocale(locale) !== "ja"
    ? `${part("weekday")}, ${part("day")} ${part("month")} ${part("year")}`
    : `${part("year")}年${part("month")}月${part("day")}日(${part("weekday")})`;
}
// ICUの違いで全角円記号と半角円記号が入れ替わり、SSRの文字列が不一致になるのを防ぐ。
export const money = (
  value: number,
  locale: Locale,
  currency: "JPY" | DisplayCurrencyCode = "JPY",
) =>
  moneyFormat
    .get(`${uiLocale(locale)}:${currency}`)
    ?.format(value)
    .replace("￥", "¥") ?? String(value);
export const time = (value: number, locale: Locale) =>
  resolveLocalized(timeFormat, uiLocale(locale)).format(value);
export const dateTime = (value: Date | number, locale: Locale) =>
  `${calendarDate(value, locale)}${uiLocale(locale) === "en" ? "," : ""} ${resolveLocalized(timeFormat, uiLocale(locale)).format(value)}`;

const relativeFormat: { [language: string]: Intl.RelativeTimeFormat; ja: Intl.RelativeTimeFormat } =
  { ja: new Intl.RelativeTimeFormat(locales.ja, { numeric: "auto" }) };
for (const language of ["en", "zh-Hans", "ko"] as const)
  relativeFormat[language] = new Intl.RelativeTimeFormat(locales[language], { numeric: "auto" });
/** 呼出からの経過時間を、分・時間・日の境界で過大に丸めず表示する。 */
export function relativeTime(value: number, now: number, locale: Locale) {
  const seconds = Math.max(0, (now - value) / 1000);
  const [unit, size]: [Intl.RelativeTimeFormatUnit, number] =
    seconds < 60
      ? ["second", 1]
      : seconds < 3600
        ? ["minute", 60]
        : seconds < 86400
          ? ["hour", 3600]
          : seconds < 604800
            ? ["day", 86400]
            : seconds < 2592000
              ? ["week", 604800]
              : seconds < 31536000
                ? ["month", 2592000]
                : ["year", 31536000];
  return resolveLocalized(relativeFormat, uiLocale(locale)).format(
    -Math.floor(seconds / size),
    unit,
  );
}
