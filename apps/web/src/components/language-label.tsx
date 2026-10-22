import type { Locale } from "@tablecast/api/schema";
import { locales } from "../paraglide/runtime.js";
import { Flag } from "./flag";
import { languageFlags } from "./flags";

const languageNames = new Map<Locale, string>();
for (const locale of locales) {
  languageNames.set(
    locale,
    new Intl.DisplayNames([locale], { type: "language" }).of(locale) ?? locale,
  );
}

/** compactは小さな旗と読み上げ用の言語名を使い、狭いバー内でも識別を保つ。 */
export function LanguageLabel({ locale, compact = false }: { compact?: boolean; locale: Locale }) {
  const flag = languageFlags[locale];
  return (
    <span lang={locale} className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {flag && <Flag src={flag} />}
      <span className={compact ? "sr-only" : undefined}>{languageNames.get(locale)}</span>
    </span>
  );
}
