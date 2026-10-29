import type { Locale } from "@tablecast/api/schema";
import { Languages } from "lucide-react";
import { useMemo } from "react";
import { Flag } from "./flag";
import { languageFlag } from "./flags";

/** compactは小さな旗と読み上げ用の言語名を使い、狭いバー内でも識別を保つ。 */
export function LanguageLabel({ locale, compact = false }: { compact?: boolean; locale: Locale }) {
  const flag = languageFlag(locale);
  const name = useMemo(
    () => new Intl.DisplayNames([locale], { type: "language" }).of(locale) ?? locale,
    [locale],
  );
  return (
    <span lang={locale} className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {flag ? (
        <Flag src={flag} />
      ) : compact ? (
        <Languages className="size-4" aria-hidden="true" />
      ) : null}
      <span className={compact ? "sr-only" : undefined}>{name}</span>
    </span>
  );
}
