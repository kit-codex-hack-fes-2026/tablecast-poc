import type { Locale } from "@tablecast/api/schema";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { m } from "../paraglide/messages.js";
import { getLocale, setLocale as setRuntimeLocale } from "../paraglide/runtime.js";

const LocaleContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void }>({
  locale: "ja",
  setLocale: () => undefined,
});

export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, updateLocale] = useState<Locale>(initialLocale ?? getLocale());
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const setLocale = useCallback((next: Locale) => {
    updateLocale(next);
    void setRuntimeLocale(next, { reload: false });
  }, []);
  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  const context = useContext(LocaleContext);
  const t = useCallback(
    (key: keyof typeof m) => m[key]({}, { locale: context.locale }),
    [context.locale],
  );
  return { ...context, t };
}
