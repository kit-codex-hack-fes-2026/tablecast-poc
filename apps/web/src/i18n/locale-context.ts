import { createContext } from "react";
import type { Locale } from "@tablecast/api/schema";

export const LocaleContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void }>(
  {
    locale: "ja",
    setLocale: () => undefined,
  },
);
