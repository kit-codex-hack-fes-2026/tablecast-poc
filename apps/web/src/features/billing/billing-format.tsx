import { resolveLocalized } from "@tablecast/api/localization";
import type { useI18n } from "../../i18n/locale";

const yen = {
  ja: new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 2,
  }),
  en: new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 2,
  }),
};

export const months = {
  ja: new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "long", timeZone: "UTC" }),
};

export const billingMoney = (value: number, locale: ReturnType<typeof useI18n>["locale"]) =>
  resolveLocalized(yen, locale).format(value).replace("￥", "¥");
