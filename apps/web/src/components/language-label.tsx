import type { Locale } from "@tablecast/api/schema";
import { useI18n } from "../i18n/locale";

/** Simple Flagsは言語名を探す補助。読上げと識別には文字ラベルを使う。 */
export function LanguageLabel({ locale }: { locale: Locale }) {
  const { t } = useI18n();
  return (
    <span lang={locale} className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <img
        src={`/flags/${locale === "ja" ? "jp" : "gb"}.svg`}
        width={18}
        height={14}
        className="h-3.5 w-4.5 shrink-0 rounded-xs object-contain"
        alt=""
        aria-hidden="true"
      />
      {t(locale === "ja" ? "common_language_native_ja" : "common_language_native_en")}
    </span>
  );
}
