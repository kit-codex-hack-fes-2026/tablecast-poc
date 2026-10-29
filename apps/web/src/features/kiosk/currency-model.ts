import type { DisplayCurrencyCode, Locale } from "@tablecast/api/schema";

// 言語の地域は初期値の目安にだけ使う。手動選択と円の正式価格は変更しない。
const regionCurrencies: Partial<Record<string, DisplayCurrencyCode>> = {
  US: "USD",
  GB: "GBP",
  AU: "AUD",
  NZ: "NZD",
  CN: "CNY",
  HK: "HKD",
  TW: "TWD",
  KR: "KRW",
  MO: "MOP",
  MN: "MNT",
  KP: "KPW",
  SG: "SGD",
  TH: "THB",
  VN: "VND",
  MY: "MYR",
  ID: "IDR",
  PH: "PHP",
  BN: "BND",
  KH: "KHR",
  LA: "LAK",
  MM: "MMK",
};
// EUのユーロ採用国。https://europa.eu/youreurope/citizens/travel/carry/using-euro/index_en.htm
const euroRegions = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PT",
  "SK",
  "SI",
  "ES",
]);

export function automaticDisplayCurrency(locale: Locale): DisplayCurrencyCode | null {
  try {
    const region = new Intl.Locale(locale).maximize().region;
    if (!region) return null;
    if (euroRegions.has(region)) return "EUR";
    return regionCurrencies[region] ?? null;
  } catch {
    return null;
  }
}
