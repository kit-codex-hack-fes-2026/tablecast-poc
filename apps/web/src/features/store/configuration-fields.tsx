import { Checkbox } from "@base-ui/react/checkbox";
import type { Product } from "@tablecast/api/schema";
import { Check, type LucideIcon } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";

export function ConfigurationSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="@container min-w-0 space-y-5 border-t border-border pt-6 first:border-t-0 first:pt-0"
    >
      <h2 id={id} className="flex items-start gap-2 text-lg font-semibold">
        <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        {title}
      </h2>
      <div className="grid min-w-0 gap-5">{children}</div>
    </section>
  );
}

export function BooleanField({
  label,
  value,
  onChange,
  disabled,
  labelledBy,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  labelledBy?: string;
}) {
  const id = useId();
  return (
    <label className="flex min-h-12 items-center gap-3 text-sm">
      <Checkbox.Root
        aria-labelledby={labelledBy ? `${labelledBy} ${id}` : id}
        className="flex items-center justify-center border border-border rounded-md shrink-0 [&[data-checked]]:bg-primary [&[data-checked]]:border-primary [&[data-checked]]:text-card [&_span]:flex size-5"
        checked={value}
        disabled={disabled}
        onCheckedChange={onChange}
      >
        <Checkbox.Indicator>
          <Check aria-hidden="true" size={16} />
        </Checkbox.Indicator>
      </Checkbox.Root>
      <span id={id}>{label}</span>
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
  labelledBy,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  labelledBy?: string;
}) {
  const id = useId();
  return (
    <label className="grid min-w-0 gap-2 text-sm">
      <span id={id}>{label}</span>
      <Input
        aria-labelledby={labelledBy ? `${labelledBy} ${id}` : id}
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
  labelledBy,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  labelledBy?: string;
}) {
  const id = useId();
  return (
    <label className="grid min-w-0 gap-2 text-sm">
      <span id={id}>{label}</span>
      <textarea
        aria-labelledby={labelledBy ? `${labelledBy} ${id}` : id}
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
  labelledBy,
}: {
  label: string;
  value: string[];
  options: { id: string; label: string }[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  labelledBy?: string;
}) {
  const id = useId();
  const { t } = useI18n();
  return (
    <label className="grid min-w-0 gap-2 text-sm">
      <span id={id}>{label}</span>
      <NativeSelect
        aria-labelledby={labelledBy ? `${labelledBy} ${id}` : id}
        multiple
        className="min-h-24 rounded-lg border border-input p-2 text-base"
        size={Math.min(6, Math.max(2, options.length))}
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange([...event.target.selectedOptions].map((option) => option.value))
        }
      >
        {value.flatMap((referenceId) =>
          !options.some((option) => option.id === referenceId)
            ? [
                <option key={referenceId} value={referenceId}>
                  {referenceId} · {t("editor_missing_reference")}
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
  labelledBy,
}: {
  value: Product["text"];
  onChange: (value: Product["text"]) => void;
  disabled?: boolean;
  labelledBy?: string;
}) {
  const id = useId();
  const { t } = useI18n();
  const fields = [
    { key: "displayName", label: t("admin_display_name") },
    { key: "speechName", label: t("admin_speech_name") },
    { key: "description", label: t("admin_description") },
  ] as const;
  return (
    <div className="@container grid min-w-0 gap-5 @xl:grid-cols-2">
      {(["ja", "en"] as const).map((language) => (
        <fieldset key={language} className="flex flex-col gap-4 min-w-0 pt-0" disabled={disabled}>
          <legend id={`${id}-${language}`} className="mb-3 font-semibold">
            {t(language === "ja" ? "common_ja" : "common_en")}
          </legend>
          {fields.map(({ key, label }) => (
            <label className="flex flex-col gap-2 text-sm" key={key}>
              <span id={`${id}-${language}-${key}`}>{label}</span>
              {key === "description" ? (
                <textarea
                  aria-labelledby={`${labelledBy ?? ""} ${id}-${language} ${id}-${language}-${key}`}
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
                  aria-labelledby={`${labelledBy ?? ""} ${id}-${language} ${id}-${language}-${key}`}
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
            labelledBy={`${labelledBy ?? ""} ${id}-${language}`}
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
