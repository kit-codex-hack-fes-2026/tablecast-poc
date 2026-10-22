import type { DisplayCurrencyCode, ExchangeRates, Locale } from "@tablecast/api/schema";
import { defaultDisplayCurrency } from "@tablecast/api/currency-display";
import { displayCurrencyPreferenceSchema, exchangeRatesSchema } from "@tablecast/api/schema";
import { useQuery } from "@tanstack/react-query";
import { useHydrated } from "@tanstack/react-router";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CurrencyController } from "./voice-model";
import { CurrencyContext } from "../../i18n/currency-context";
import { parseResponse, type TableEndpoint } from "../../lib/api";

type Preference = { currency: DisplayCurrencyCode | null; manual: boolean; revision: number };
const Controls = createContext<null | {
  choose: (currency: DisplayCurrencyCode | null) => void;
  controller: CurrencyController;
  pending: boolean;
  snapshot?: ExchangeRates;
}>(null);

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
  const hydrated = useHydrated();
  const query = useQuery({
    queryKey: ["tablecast-exchange-rates", endpoint.key, sessionId],
    queryFn: async ({ signal }) =>
      exchangeRatesSchema.parse(
        await parseResponse(endpoint.client["exchange-rates"].$get({}, { init: { signal } })),
      ),
    enabled: hydrated,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const [preference, setPreference] = useState<Preference>(() => ({
    currency: defaultDisplayCurrency(locale),
    manual: false,
    revision: 0,
  }));
  const current = useRef(preference);
  const rates = useRef(query.data);
  useEffect(() => {
    rates.current = query.data;
  }, [query.data]);
  const initialLocale = useRef(locale);
  const storageKey = `tablecast-display-currency:${endpoint.key}`;
  const update = useCallback(
    (next: Preference) => {
      current.current = next;
      setPreference(next);
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ sessionId, currency: next.currency, manual: next.manual }),
        );
      } catch {
        // 保存できなくても画面内の選択と円の注文は継続する。
      }
    },
    [sessionId, storageKey],
  );
  const choose = useCallback(
    (currency: DisplayCurrencyCode | null) => {
      update({ currency, manual: true, revision: current.current.revision + 1 });
    },
    [update],
  );
  useEffect(() => {
    let next: Preference = {
      currency: defaultDisplayCurrency(initialLocale.current),
      manual: false,
      revision: 0,
    };
    try {
      const saved = displayCurrencyPreferenceSchema.safeParse(
        JSON.parse(localStorage.getItem(storageKey) ?? "null"),
      );
      if (saved.success && saved.data.sessionId === sessionId) {
        next = {
          currency: saved.data.manual
            ? saved.data.currency
            : defaultDisplayCurrency(initialLocale.current),
          manual: saved.data.manual,
          revision: 0,
        };
      }
    } catch {
      // 保存不可・破損時も画面内の通貨選択は利用できる。
    }
    update(next);
  }, [sessionId, storageKey, update]);
  useEffect(() => {
    const previous = current.current;
    const currency = defaultDisplayCurrency(locale);
    if (!previous.manual && previous.currency !== currency)
      update({ ...previous, currency, revision: previous.revision + 1 });
  }, [locale, update]);
  const controller = useMemo<CurrencyController>(
    () => ({
      getContext: () => ({
        currency: current.current.currency,
        revision: current.current.revision,
        ...(rates.current ? { rates: rates.current } : {}),
      }),
      apply: (action) => {
        if (action.revision !== current.current.revision) return false;
        choose(action.currency);
        return true;
      },
    }),
    [choose],
  );
  const controls = useMemo(
    () => ({ controller, choose, pending: query.isPending, snapshot: query.data }),
    [controller, choose, query.isPending, query.data],
  );
  const display = useMemo(
    () => ({ currency: preference.currency, rates: query.data }),
    [preference.currency, query.data],
  );
  return (
    <Controls.Provider value={controls}>
      <CurrencyContext.Provider value={display}>{children}</CurrencyContext.Provider>
    </Controls.Provider>
  );
}
export function useCurrencyControls() {
  return useContext(Controls);
}
