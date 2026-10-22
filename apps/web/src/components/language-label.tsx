import type { Locale } from "@tablecast/api/schema";
import { useI18n } from "../i18n/locale";
import { gb, jp } from "./flags";

/** compactは小さな旗と読み上げ用の言語名を使い、狭いバー内でも識別を保つ。 */
export function LanguageLabel({ locale, compact = false }: { compact?: boolean; locale: Locale }) {
  const { t } = useI18n();
  return (
    <span lang={locale} className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <img
        src={locale === "ja" ? jp : gb}
        width={18}
        height={14}
        className="h-3.5 w-4.5 shrink-0 rounded-xs object-contain"
        alt=""
        aria-hidden="true"
      />
      <span className={compact ? "sr-only" : undefined}>
        {t(locale === "ja" ? "common_language_native_ja" : "common_language_native_en")}
      </span>
    </span>
  );
}
