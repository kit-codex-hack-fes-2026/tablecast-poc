import type { Locale } from "../../platform/model";
import type { DisplayCurrencyCode, ExchangeRates } from "./model";
import { displayCurrencyCodes } from "./model";
export { currencyFlags, displayCurrencyCodes } from "./model";

const currencyLocales: Record<Locale, string> = { ja: "ja-JP", en: "en-GB" };
const defaultCurrencies: Record<Locale, DisplayCurrencyCode | null> = { ja: null, en: "USD" };
const currencySymbols = new Map<string, string>(
  displayCurrencyCodes.map((currency) => [
    currency,
    new Intl.NumberFormat("en-GB", { style: "currency", currency })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value ?? currency,
  ]),
);
export const currencySymbol = (currency: "JPY" | DisplayCurrencyCode) =>
  currency === "JPY" ? "¥" : (currencySymbols.get(currency) ?? currency);
export const defaultDisplayCurrency = (locale: Locale) => defaultCurrencies[locale];

export function convertedAmount(yen: number, currency: DisplayCurrencyCode, rate: number) {
  const digits = new Intl.NumberFormat("en-GB", { style: "currency", currency }).resolvedOptions()
    .maximumFractionDigits;
  return Number(
    new Intl.NumberFormat("en-GB", {
      useGrouping: false,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(yen * rate),
  );
}
export function foreignMoney(amount: number, currency: DisplayCurrencyCode, locale: Locale) {
  return new Intl.NumberFormat(currencyLocales[locale], { style: "currency", currency }).format(
    amount,
  );
}
export function currencyName(currency: DisplayCurrencyCode, locale: Locale) {
  return (
    new Intl.DisplayNames([currencyLocales[locale]], { type: "currency" }).of(currency) ?? currency
  );
}
export function currencyMetadata(currency: DisplayCurrencyCode | null, snapshot?: ExchangeRates) {
  const rate = currency ? snapshot?.rates[currency] : undefined;
  return {
    currency,
    status:
      currency === null ? ("off" as const) : rate ? ("ready" as const) : ("unavailable" as const),
    ...(rate && snapshot
      ? { rate, date: snapshot.date, source: snapshot.source, approximate: true as const }
      : {}),
  };
}
/** 金額だと確認したフィールドだけを渡し、件数や版番号を換算しない。 */
export function approximateAmounts(
  values: Record<string, number>,
  currency: DisplayCurrencyCode | null,
  snapshot?: ExchangeRates,
) {
  const rate = currency ? snapshot?.rates[currency] : undefined;
  if (!currency || !rate) return {};
  return {
    approximate: Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, convertedAmount(value, currency, rate)]),
    ),
  };
}
