import type { Locale } from "@tablecast/api/schema";
import { createContext } from "react";

export const LocaleContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void }>(
  {
    locale: "ja",
    setLocale: () => undefined,
  },
);
