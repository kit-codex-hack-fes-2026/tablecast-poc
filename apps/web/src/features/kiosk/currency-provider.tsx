import type { CoreState, DisplayCurrencyCode, Locale } from "@tablecast/api/schema";
import { displayCurrencyCodeSchema } from "@tablecast/api/schema";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useHydrated } from "@tanstack/react-router";
import { type ReactNode, useMemo } from "react";
import { z } from "zod";
import type { TableEndpoint } from "../../lib/api";
import { CurrencyContext, type CurrencyDisplay } from "../../i18n/currency-context";
import { exchangeRateOptions, tableQueryKey } from "./table-query";

type Preference = { currency: DisplayCurrencyCode | null | undefined; revision: number };
const automatic: Preference = { currency: undefined, revision: 0 };
const savedPreference = z.object({
  sessionId: z.string(),
  currency: displayCurrencyCodeSchema.nullable(),
  manual: z.boolean(),
});
const defaultCurrency = (locale: Locale) => (locale === "en" ? ("USD" as const) : null);

export function CurrencyProvider({
  children,
  endpoint,
  sessionId,
  locale,
}: {
  children: ReactNode;
  endpoint: TableEndpoint;
  locale: Locale;
  sessionId: string;
}) {
  const client = useQueryClient();
  const hydrated = useHydrated();
  const rateOptions = exchangeRateOptions(endpoint, sessionId);
  const storageKey = `tablecast-display-currency:${endpoint.key}`;
  const preferenceKey = [storageKey, sessionId];
  const preference = useQuery({
    queryKey: preferenceKey,
    enabled: hydrated,
    staleTime: "static",
    gcTime: Infinity,
    queryFn: (): Preference => {
      try {
        const saved = savedPreference.safeParse(
          JSON.parse(localStorage.getItem(storageKey) ?? "null"),
        );
        if (saved.success && saved.data.sessionId === sessionId && saved.data.manual)
          return { currency: saved.data.currency, revision: 0 };
      } catch {
        /* 保存できなくても円の注文と画面内の選択は利用できる。 */
      }
      return automatic;
    },
  });
  const rates = useQuery({ ...rateOptions, enabled: hydrated });
  const selectedCurrency = preference.data?.currency;
  const value = useMemo<CurrencyDisplay>(
    () => ({
      currency: selectedCurrency === undefined ? defaultCurrency(locale) : selectedCurrency,
      rates: rates.data,
      pending: rates.isPending,

      getContext: () => {
        const selection = client.getQueryData<Preference>([storageKey, sessionId]) ?? automatic;
        const currentLocale =
          client.getQueryData<CoreState>(tableQueryKey(endpoint))?.locale ?? locale;
        return {
          currency:
            selection.currency === undefined ? defaultCurrency(currentLocale) : selection.currency,
          revision: selection.revision,
          rates: client.getQueryData(exchangeRateOptions(endpoint, sessionId).queryKey),
        };
      },
      setCurrency: (currency: DisplayCurrencyCode | null, expectedRevision?: number) => {
        const previous = client.getQueryData<Preference>([storageKey, sessionId]) ?? automatic;
        if (expectedRevision !== undefined && previous.revision !== expectedRevision) return false;
        client.setQueryData<Preference>([storageKey, sessionId], {
          currency,
          revision: previous.revision + 1,
        });
        try {
          localStorage.setItem(storageKey, JSON.stringify({ sessionId, currency, manual: true }));
        } catch {
          /* 選択はcache内で保持する。 */
        }
        return true;
      },
    }),
    [
      client,
      endpoint,
      sessionId,
      storageKey,
      locale,
      selectedCurrency,
      rates.data,
      rates.isPending,
    ],
  );
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}
