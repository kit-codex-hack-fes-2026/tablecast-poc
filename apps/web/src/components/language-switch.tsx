import type { Locale } from "@tablecast/api/schema";
import { LanguageLabel } from "./language-label";
import { Button } from "./ui/button";
import { useI18n } from "../i18n/locale";

const languages = ["ja", "en"] as const;

/**
 * 日英を直接選ぶ操作。
 * onChange(locale)で選択を通知し、disabledで更新中の二重操作を防ぐ。
 * 現在言語はLocaleProviderから読みaria-pressedで示す。
 * 翻訳データと永続化は呼出し元が所有する。
 */
export function LanguageSwitch({
  onChange,
  disabled = false,
}: {
  onChange: (locale: Locale) => void;
  disabled?: boolean;
}) {
  const { locale, t } = useI18n();
  return (
    <fieldset
      data-ui="language-switch"
      className="flex shrink-0 rounded-lg border border-border bg-muted p-1"
      aria-label={t("common_language")}
    >
      {languages.map((language) => (
        <Button
          key={language}
          className="whitespace-nowrap font-medium aria-pressed:bg-card aria-pressed:text-info aria-pressed:shadow-sm max-xl:px-2 max-sm:px-1.5"
          size="sm"
          variant="ghost"
          type="button"
          lang={language}
          aria-pressed={locale === language}
          disabled={disabled}
          onClick={() => onChange(language)}
        >
          <LanguageLabel locale={language} />
        </Button>
      ))}
    </fieldset>
  );
}
