import { z } from "zod";

export const displayCurrencyCodes = [
  "USD",
  "GBP",
  "EUR",
  "AUD",
  "NZD",
  "CNY",
  "HKD",
  "TWD",
  "KRW",
  "MOP",
  "MNT",
  "KPW",
  "SGD",
  "THB",
  "VND",
  "MYR",
  "IDR",
  "PHP",
  "BND",
  "KHR",
  "LAK",
  "MMK",
] as const;
export const displayCurrencyCodeSchema = z.enum(displayCurrencyCodes);
export type DisplayCurrencyCode = z.infer<typeof displayCurrencyCodeSchema>;
export const exchangeRatesSchema = z.object({
  base: z.literal("JPY"),
  date: z.iso.date(),
  source: z.literal("currency-api"),
  rates: z.partialRecord(displayCurrencyCodeSchema, z.number().finite().positive()),
});
export type ExchangeRates = z.infer<typeof exchangeRatesSchema>;
export const displayCurrencyContextSchema = z
  .object({
    currency: displayCurrencyCodeSchema.nullable(),
    revision: z.number().int().nonnegative(),
    rates: exchangeRatesSchema.optional(),
  })
  .strict();
export type DisplayCurrencyContext = z.infer<typeof displayCurrencyContextSchema>;
export const displayCurrencyActionSchema = z
  .object({
    currency: displayCurrencyCodeSchema.nullable(),
    revision: z.number().int().nonnegative(),
  })
  .strict();
