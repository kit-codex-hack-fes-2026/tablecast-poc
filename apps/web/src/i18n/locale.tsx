import type { Locale } from "@tablecast/api/schema";
import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { m } from "../paraglide/messages.js";
import { getLocale, setLocale as setRuntimeLocale } from "../paraglide/runtime.js";

import { LocaleContext } from "./locale-context";

export function LocaleProvider({
  children,
  initialLocale,
  persist = true,
}: {
  children: ReactNode;
  initialLocale?: Locale;
  persist?: boolean;
}) {
  const [locale, updateLocale] = useState<Locale>(initialLocale ?? getLocale());
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const setLocale = useCallback(
    (next: Locale) => {
      updateLocale(next);
      if (persist) void setRuntimeLocale(next, { reload: false });
    },
    [persist],
  );
  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

type MessageKey = Extract<keyof typeof m, string>;
type SimpleMessageKey = {
  [Key in MessageKey]: Record<string, never> extends Parameters<(typeof m)[Key]>[0] ? Key : never;
}[MessageKey];

export function useI18n() {
  const context = useContext(LocaleContext);
  const t = useCallback(
    (key: SimpleMessageKey) => m[key]({}, { locale: context.locale }),
    [context.locale],
  );
  return { ...context, t };
}
