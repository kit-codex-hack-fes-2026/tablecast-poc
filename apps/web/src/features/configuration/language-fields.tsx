import { type Locale, localeSchema } from "@tablecast/api/schema";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { LanguageLabel } from "../../components/language-label";
import * as Tabs from "../../components/ui/tabs";
import { useI18n } from "../../i18n/locale";

/** 言語を同じ幅で編集し、切り替えても未保存内容と入力履歴を保つ。 */
export function LanguageFields({
  children,
  value,
  onValueChange,
}: {
  children: (language: Locale, labelId: string) => ReactNode;
  onValueChange?: (language: Locale) => void;
  value?: Locale;
}) {
  const id = useId();
  const { locale, t } = useI18n();
  const [selection, setSelection] = useState<Locale>(locale);
  const selected = value ?? selection;
  const invalidField = useRef<null | {
    field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    language: Locale;
  }>(null);
  function select(language: Locale) {
    setSelection(language);
    onValueChange?.(language);
  }
  useEffect(() => {
    const pending = invalidField.current;
    if (!pending || pending.language !== selected || pending.field.closest("[hidden]")) return;
    invalidField.current = null;
    pending.field.focus();
    pending.field.reportValidity();
  }, [selected]);
  const languageNames = useMemo(
    () => new Intl.DisplayNames([locale], { type: "language" }),
    [locale],
  );
  return (
    <Tabs.Root
      value={selected}
      onValueChange={(next) => {
        const parsed = localeSchema.safeParse(next);
        if (parsed.success) select(parsed.data);
      }}
      className="min-w-0 space-y-5"
    >
      <Tabs.List aria-label={t("common_language")} className="max-w-full">
        {localeSchema.options.map((language) => (
          <Tabs.Tab key={language} value={language}>
            <LanguageLabel locale={language} />
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {localeSchema.options.map((language) => (
        <Tabs.Panel
          key={language}
          value={language}
          keepMounted
          className="min-w-0"
          onInvalidCapture={(event) => {
            if (language === selected) return;
            event.preventDefault();
            const field = event.target;
            if (
              !invalidField.current &&
              (field instanceof HTMLInputElement ||
                field instanceof HTMLTextAreaElement ||
                field instanceof HTMLSelectElement)
            ) {
              invalidField.current = { field, language };
              select(language);
            }
          }}
        >
          <fieldset className="min-w-0 space-y-6">
            <legend id={`${id}-${language}`} className="sr-only">
              {languageNames.of(language)}
            </legend>
            {children(language, `${id}-${language}`)}
          </fieldset>
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}
