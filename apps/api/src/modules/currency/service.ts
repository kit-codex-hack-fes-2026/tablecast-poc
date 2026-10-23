import { z } from "zod";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import type { ExchangeRates } from "./model";
import { DomainError, ensure } from "../../platform/errors";
import { getSession } from "../tables/queries";
import { displayCurrencyCodes, exchangeRatesSchema } from "./model";

const endpoints = [
  "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/jpy.min.json",
  "https://latest.currency-api.pages.dev/v1/currencies/jpy.min.json",
];
const sourceSchema = z.object({ date: z.iso.date(), jpy: z.record(z.string(), z.unknown()) });
export async function initialiseExchangeRates(services: ApiServices, actor: Actor) {
  const session = await getSession(services, actor);
  ensure(session.status === "open", "SESSION_CLOSED");
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) continue;
      const source = sourceSchema.parse(await response.json());
      if (source.jpy.jpy !== 1) continue;
      const rates: ExchangeRates["rates"] = {};
      for (const code of displayCurrencyCodes) {
        const rate = z.number().finite().positive().safeParse(source.jpy[code.toLowerCase()]);
        if (rate.success) rates[code] = rate.data;
      }
      if (Object.keys(rates).length === 0) continue;
      const snapshot = exchangeRatesSchema.parse({
        base: "JPY",
        date: source.date,
        source: "currency-api",
        rates,
      });
      return snapshot;
    } catch {
      // 同じ初期化の中で代替CDNを一度だけ試す。業務の円金額には影響させない。
    }
  }
  throw new DomainError("DISPLAY_RATES_UNAVAILABLE", 503, "DISPLAY_RATES_UNAVAILABLE");
}
