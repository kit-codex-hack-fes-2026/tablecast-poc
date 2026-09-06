import { Checkbox } from "@base-ui/react/checkbox";
import type { Product } from "@tablecast/api/schema";
import { Check, Plus, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useI18n } from "../../i18n/locale";

export function emptyText(): Product["text"] {
  return {
    ja: { displayName: "", speechName: "", description: "", aliases: [] },
    en: { displayName: "", speechName: "", description: "", aliases: [] },
  };
}

export function BooleanField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="checkbox-label flex-row">
      <Checkbox.Root
        className="checkbox-control"
        checked={value}
        disabled={disabled}
        onCheckedChange={onChange}
      >
        <Checkbox.Indicator>
          <Check size={16} />
        </Checkbox.Indicator>
      </Checkbox.Root>
      <span>{label}</span>
    </label>
  );
}

export function NumericField({
  label,
  value,
  onChange,
  min,
  max,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  return (
    <label>
      {label}
      <Input
        type="number"
        required
        step={1}
        min={min}
        max={max}
        disabled={disabled}
        value={Number.isFinite(value) ? value : ""}
        onChange={(event) => onChange(event.target.valueAsNumber)}
      />
    </label>
  );
}

export function StringListField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <fieldset className="grid min-w-0 gap-2" disabled={disabled}>
      <legend className="mb-2 text-sm">{label}</legend>
      {value.map((item, index) => (
        <div className="flex items-center gap-2" key={index}>
          <Input
            aria-label={`${label} ${index + 1}`}
            required
            maxLength={100}
            value={item}
            onChange={(event) =>
              onChange(
                value.map((current, position) =>
                  position === index ? event.target.value : current,
                ),
              )
            }
          />
          <Button
            variant="ghost"
            type="button"
            aria-label={`${t("common_remove")}: ${label} ${index + 1}`}
            onClick={() => onChange(value.filter((_, position) => position !== index))}
          >
            <Trash2 size={16} />
          </Button>
        </div>
      ))}
      <Button
        className="justify-self-start"
        variant="outline"
        type="button"
        onClick={() => onChange([...value, ""])}
      >
        <Plus size={16} />
        {t("editor_add")}: {label}
      </Button>
    </fieldset>
  );
}

export function ReferencesField({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string[];
  options: { id: string; label: string }[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <label>
      {label}
      <select
        multiple
        className="min-h-24 rounded-lg border border-input p-2 text-sm"
        size={Math.min(6, Math.max(2, options.length))}
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange([...event.target.selectedOptions].map((option) => option.value))
        }
      >
        {value
          .filter((id) => !options.some((option) => option.id === id))
          .map((id) => (
            <option key={id} value={id}>
              {id} · {t("editor_missing_reference")}
            </option>
          ))}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function BilingualFields({
  value,
  onChange,
  disabled,
}: {
  value: Product["text"];
  onChange: (value: Product["text"]) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const fields = [
    { key: "displayName", label: t("admin_display_name") },
    { key: "speechName", label: t("admin_speech_name") },
    { key: "description", label: t("admin_description") },
  ] as const;
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {(["ja", "en"] as const).map((language) => (
        <fieldset key={language} className="stacked-form min-w-0 pt-0" disabled={disabled}>
          <legend className="mb-3 font-semibold">
            {t(language === "ja" ? "common_ja" : "common_en")}
          </legend>
          {fields.map(({ key, label }) => (
            <label key={key}>
              {label}
              {key === "description" ? (
                <textarea
                  className="min-h-24 w-full rounded-lg border border-input p-2 text-sm"
                  maxLength={3000}
                  value={value[language][key]}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      [language]: { ...value[language], [key]: event.target.value },
                    })
                  }
                />
              ) : (
                <Input
                  required
                  maxLength={150}
                  value={value[language][key]}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      [language]: { ...value[language], [key]: event.target.value },
                    })
                  }
                />
              )}
            </label>
          ))}
          <StringListField
            label={t("editor_aliases")}
            value={value[language].aliases}
            disabled={disabled}
            onChange={(aliases) =>
              onChange({ ...value, [language]: { ...value[language], aliases } })
            }
          />
        </fieldset>
      ))}
    </div>
  );
}
