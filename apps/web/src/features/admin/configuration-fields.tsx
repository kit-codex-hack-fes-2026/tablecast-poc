import { Checkbox } from "@base-ui/react/checkbox";
import type { Product } from "@tablecast/api/schema";
import { Check } from "lucide-react";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";

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
    <label className="flex items-center gap-3 flex-row">
      <Checkbox.Root
        className="flex items-center justify-center border border-border rounded-md shrink-0 [&[data-checked]]:bg-primary [&[data-checked]]:border-primary [&[data-checked]]:text-card [&_span]:flex size-5"
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
  return (
    <label className="flex flex-col gap-2 text-base">
      {label}
      <textarea
        className="min-h-24 rounded-lg border border-input bg-background p-3 text-base"
        disabled={disabled}
        value={value.join("\n")}
        onChange={(event) => onChange(event.target.value ? event.target.value.split("\n") : [])}
      />
    </label>
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
      <NativeSelect
        multiple
        className="min-h-24 rounded-lg border border-input p-2 text-base"
        size={Math.min(6, Math.max(2, options.length))}
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange([...event.target.selectedOptions].map((option) => option.value))
        }
      >
        {value.flatMap((id) =>
          !options.some((option) => option.id === id)
            ? [
                <option key={id} value={id}>
                  {id} · {t("editor_missing_reference")}
                </option>,
              ]
            : [],
        )}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
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
        <fieldset key={language} className="flex flex-col gap-4 min-w-0 pt-0" disabled={disabled}>
          <legend className="mb-3 font-semibold">
            {t(language === "ja" ? "common_ja" : "common_en")}
          </legend>
          {fields.map(({ key, label }) => (
            <label className="flex flex-col gap-2 text-sm" key={key}>
              {label}
              {key === "description" ? (
                <textarea
                  className="min-h-24 w-full rounded-lg border border-input p-2 text-base"
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
