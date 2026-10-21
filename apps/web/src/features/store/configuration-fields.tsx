import type { Product } from "@tablecast/api/schema";
import type { LucideIcon } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Input } from "../../components/ui/input";
import { Checkbox } from "../../components/ui/checkbox";
import { LanguageFields } from "./language-fields";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";

export function ConfigurationSection({
  title,
  icon: Icon,
  children,
  id: sectionId,
  headingId,
}: {
  id?: string;
  headingId?: string;
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  const generatedId = useId();
  const id = headingId ?? generatedId;
  return (
    <section
      id={sectionId}
      aria-labelledby={id}
      className="@container min-w-0 scroll-mt-28 space-y-5 rounded-2xl border border-border/60 bg-card p-4 sm:p-5"
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
  inputId,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  labelledBy?: string;
  inputId?: string;
}) {
  const id = useId();
  return (
    <label className="flex min-h-12 items-center gap-3 text-sm">
      <Checkbox
        id={inputId}
        aria-labelledby={labelledBy ? `${labelledBy} ${id}` : id}
        checked={value}
        disabled={disabled}
        onCheckedChange={onChange}
      />
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
  includeName = true,
}: {
  value: Product["text"];
  onChange: (value: Product["text"]) => void;
  disabled?: boolean;
  labelledBy?: string;
  includeName?: boolean;
}) {
  const id = useId();
  const { t } = useI18n();
  const fields = [
    { key: "displayName", label: t("admin_display_name") },
    { key: "speechName", label: t("admin_speech_name") },
    { key: "description", label: t("admin_description") },
  ] as const;
  return (
    <LanguageFields>
      {(language, languageLabelId) => (
        <fieldset className="grid min-w-0 gap-4" disabled={disabled}>
          {fields
            .filter(({ key }) => includeName || key !== "displayName")
            .map(({ key, label }) => (
              <label className="grid min-w-0 gap-2 text-sm" key={key}>
                <span id={`${id}-${language}-${key}`}>{label}</span>
                {key === "description" ? (
                  <textarea
                    lang={language}
                    aria-labelledby={`${labelledBy ?? ""} ${languageLabelId} ${id}-${language}-${key}`}
                    className="field-sizing-content min-h-24 w-full resize-y rounded-lg border border-input bg-background p-3 text-base"
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
                    lang={language}
                    aria-labelledby={`${labelledBy ?? ""} ${languageLabelId} ${id}-${language}-${key}`}
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
            labelledBy={`${labelledBy ?? ""} ${languageLabelId}`}
            label={t("editor_aliases")}
            value={value[language].aliases}
            disabled={disabled}
            onChange={(aliases) =>
              onChange({ ...value, [language]: { ...value[language], aliases } })
            }
          />
        </fieldset>
      )}
    </LanguageFields>
  );
}
