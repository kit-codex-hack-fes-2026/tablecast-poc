import { Button } from "../components/ui/button";
import type { Locale } from "@tablecast/api/schema";
import { useI18n } from "../i18n/locale";

export function LanguageSwitch({
  onChange,
  disabled = false,
}: {
  onChange: (locale: Locale) => void;
  disabled?: boolean;
}) {
  const { locale, t } = useI18n();
  return (
    <fieldset className="language-switch" aria-label={t("common_language")}>
      <Button
        variant="ghost"
        type="button"
        lang="ja"
        aria-pressed={locale === "ja"}
        disabled={disabled}
        onClick={() => onChange("ja")}
      >
        <img className="language-flag" src="/flags/jp.svg" alt="" aria-hidden="true" />
        日本語
      </Button>
      <Button
        variant="ghost"
        type="button"
        lang="en"
        aria-pressed={locale === "en"}
        disabled={disabled}
        onClick={() => onChange("en")}
      >
        <img className="language-flag" src="/flags/gb.svg" alt="" aria-hidden="true" />
        English
      </Button>
    </fieldset>
  );
}
