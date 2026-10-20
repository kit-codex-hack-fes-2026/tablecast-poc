import type { Locale } from "@tablecast/api/schema";
import { useI18n } from "../i18n/locale";

/** Simple Flagsは言語名を探す補助。読上げと識別には文字ラベルを使う。 */
export function LanguageLabel({ locale }: { locale: Locale }) {
  const { t } = useI18n();
  return (
    <span lang={locale} className="inline-flex items-center gap-2 whitespace-nowrap">
      <img
        src={`/flags/${locale === "ja" ? "jp" : "gb"}.svg`}
        width={28}
        height={20}
        className="h-5 w-7 shrink-0 rounded-sm object-contain ring-1 ring-black/10"
        alt=""
        aria-hidden="true"
      />
      {t(locale === "ja" ? "common_language_native_ja" : "common_language_native_en")}
    </span>
  );
}
