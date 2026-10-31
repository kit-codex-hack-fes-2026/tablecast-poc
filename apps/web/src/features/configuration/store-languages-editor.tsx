import { type Configuration, localeSchema } from "@tablecast/api/schema";
import { useState } from "react";
import { LanguageLabel } from "../../components/language-label";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useI18n } from "../../i18n/locale";

export function StoreLanguagesEditor({
  value,
  onChange,
  disabled,
}: {
  disabled: boolean;
  onChange: (configuration: Configuration) => void;
  value: Configuration;
}) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [invalid, setInvalid] = useState(false);
  function add() {
    let normalised: string | undefined;
    try {
      normalised = Intl.getCanonicalLocales(code.trim())[0];
    } catch {
      normalised = undefined;
    }
    if (!normalised || !localeSchema.safeParse(normalised).success) {
      setInvalid(true);
      return;
    }
    if (!value.languages.includes(normalised))
      onChange({ ...value, languages: [...value.languages, normalised] });
    setCode("");
    setInvalid(false);
  }
  return (
    <fieldset disabled={disabled} className="mb-6 grid gap-3 rounded-lg border border-border p-4">
      <legend className="font-semibold">{t("editor_store_languages")}</legend>
      <div className="flex flex-wrap gap-3">
        {value.languages.map((language) => (
          <span key={language} className="inline-flex items-center gap-2">
            <LanguageLabel locale={language} />
            {!["ja", "en"].includes(language) && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`${t("common_remove")}: ${language}`}
                onClick={() =>
                  onChange({
                    ...value,
                    languages: value.languages.filter((item) => item !== language),
                  })
                }
              >
                ×
              </Button>
            )}
          </span>
        ))}
      </div>
      <label className="grid gap-2 text-sm">
        {t("editor_language_code")}
        <Input
          value={code}
          placeholder="fr, zh-Hans, ko"
          aria-invalid={invalid}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              add();
            }
          }}
        />
      </label>
      {invalid && (
        <p role="alert" className="text-sm text-destructive">
          {t("editor_language_code_invalid")}
        </p>
      )}
      <Button type="button" variant="outline" className="justify-self-start" onClick={add}>
        {t("common_add")}
      </Button>
    </fieldset>
  );
}
