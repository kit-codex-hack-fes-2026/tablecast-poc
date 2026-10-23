import type { DisplayCurrencyCode, ExchangeRates } from "./model";

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
