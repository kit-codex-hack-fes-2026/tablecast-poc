import type { Locale } from "@tablecast/api/schema";
const moneyFormat = {
  ja: new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }),
  en: new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }),
};
const timeFormat = {
  ja: new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }),
  en: new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }),
};
const dateFormat = {
  ja: new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }),
  en: new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }),
};
export const money = (value: number, locale: Locale) => moneyFormat[locale].format(value);
export const time = (value: number, locale: Locale) => timeFormat[locale].format(value);
export const dateTime = (value: Date | number, locale: Locale) => dateFormat[locale].format(value);
