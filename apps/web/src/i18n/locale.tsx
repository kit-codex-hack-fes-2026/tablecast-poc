import type { Locale } from "@tablecast/api/schema";
import { uiLocale } from "@tablecast/api/localization";
import { type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { m } from "../paraglide/messages.js";
import { getLocale, setLocale as setRuntimeLocale } from "../paraglide/runtime.js";
import { LocaleContext } from "./locale-context";
import { registerDefaultLocale } from "./runtime-default";

registerDefaultLocale();

export function LocaleProvider({
  children,
  initialLocale,
  persist = true,
  staffOnly = false,
}: {
  children: ReactNode;
  initialLocale?: Locale;
  persist?: boolean;
  staffOnly?: boolean;
}) {
  const [selection, updateLocale] = useState<Locale>(initialLocale ?? getLocale());
  const locale = staffOnly && selection !== "ja" && selection !== "en" ? "en" : selection;
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const setLocale = useCallback(
    (next: Locale) => {
      const language = staffOnly && next !== "ja" && next !== "en" ? "en" : next;
      updateLocale(language);
      if (persist) void setRuntimeLocale(uiLocale(language), { reload: false });
    },
    [persist, staffOnly],
  );
  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

type MessageKey = Extract<keyof typeof m, string>;
export type SimpleMessageKey = {
  [Key in MessageKey]: Record<string, never> extends Parameters<(typeof m)[Key]>[0] ? Key : never;
}[MessageKey];

export function useI18n() {
  const context = useContext(LocaleContext);
  const t = useCallback(
    (key: SimpleMessageKey) => m[key]({}, { locale: uiLocale(context.locale) }),
    [context.locale],
  );
  return { ...context, t };
}
