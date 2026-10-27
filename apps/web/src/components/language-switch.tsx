import type { Locale } from "@tablecast/api/schema";
import { Languages } from "lucide-react";
import { useI18n } from "../i18n/locale";
import { locales } from "../paraglide/runtime.js";
import { LanguageLabel } from "./language-label";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "./ui/select";

const languages = ["ja", "en"] as const;

/**
 * 日英と現在言語を直接選び、追加の対応言語はメニューから選ぶ。
 * onChange(locale)で選択を通知し、disabledで更新中の二重操作を防ぐ。
 * 現在言語はLocaleProviderから読みaria-pressedで示す。
 * 翻訳データと永続化は呼出し元が所有する。
 */
export function LanguageSwitch({
  onChange,
  disabled = false,
  withIcon = false,
}: {
  disabled?: boolean;
  onChange: (locale: Locale) => void;
  withIcon?: boolean;
}) {
  const { locale, t } = useI18n();
  const tabLanguages = [...new Set<Locale>([...languages, locale])];
  const otherLanguages = locales.filter((language) => !languages.some((tab) => tab === language));
  return (
    <fieldset
      data-ui="language-switch"
      className={`flex shrink-0 items-center border border-border bg-muted p-1 ${withIcon ? "h-11 gap-1 rounded-xl border-0 bg-transparent p-0 [&_[data-slot=button]]:h-11 [&_[data-slot=button]]:min-h-11 [&_[data-slot=button]]:rounded-xl [&_[data-slot=button]]:py-0" : "rounded-lg"}`}
      aria-label={t("common_language")}
    >
      {withIcon && <Languages aria-hidden className="mx-1 size-4 shrink-0" />}
      {tabLanguages.map((language) => (
        <Button
          key={language}
          className="whitespace-nowrap font-medium aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-sm max-xl:px-2 max-sm:px-1.5"
          size="sm"
          variant={withIcon ? "outline" : "ghost"}
          type="button"
          lang={language}
          aria-pressed={locale === language}
          disabled={disabled}
          onClick={() => onChange(language)}
        >
          <LanguageLabel locale={language} />
        </Button>
      ))}
      {otherLanguages.length > 0 && (
        <Select
          value={locale}
          disabled={disabled}
          onValueChange={(value) => {
            const language = otherLanguages.find((item) => item === value);
            if (language) onChange(language);
          }}
        >
          <SelectTrigger
            aria-label={t("common_language")}
            className="w-auto border-0 bg-transparent shadow-none"
          >
            <Languages className="size-4" />
          </SelectTrigger>
          <SelectContent>
            {otherLanguages.map((language) => (
              <SelectItem key={language} value={language}>
                <LanguageLabel locale={language} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </fieldset>
  );
}
