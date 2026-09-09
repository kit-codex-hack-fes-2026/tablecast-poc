import type { Locale } from "@tablecast/api/schema";
import { Button } from "../components/ui/button";
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
    <fieldset
      data-ui="language-switch"
      className="flex p-1 bg-muted border border-border rounded-lg shrink-0"
      aria-label={t("common_language")}
    >
      <Button
        className="min-h-11 py-2 px-2.5 rounded-md text-sm font-semibold inline-flex items-center gap-2 [&[aria-pressed='true']]:bg-card [&[aria-pressed='true']]:shadow-sm max-xl:px-2 max-lg:flex-1 max-sm:text-sm max-sm:px-1.5"
        variant="ghost"
        type="button"
        lang="ja"
        aria-pressed={locale === "ja"}
        disabled={disabled}
        onClick={() => onChange("ja")}
      >
        <img
          className="w-5 h-3.5 object-cover rounded-sm border border-border"
          src="/flags/jp.svg"
          alt=""
          aria-hidden="true"
        />
        日本語
      </Button>
      <Button
        className="min-h-11 py-2 px-2.5 rounded-md text-sm font-semibold inline-flex items-center gap-2 [&[aria-pressed='true']]:bg-card [&[aria-pressed='true']]:shadow-sm max-xl:px-2 max-lg:flex-1 max-sm:text-sm max-sm:px-1.5"
        variant="ghost"
        type="button"
        lang="en"
        aria-pressed={locale === "en"}
        disabled={disabled}
        onClick={() => onChange("en")}
      >
        <img
          className="w-5 h-3.5 object-cover rounded-sm border border-border"
          src="/flags/gb.svg"
          alt=""
          aria-hidden="true"
        />
        English
      </Button>
    </fieldset>
  );
}
