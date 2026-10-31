import { resolveLocalized } from "@tablecast/api/localization";
import { type Configuration, instructionText, type Locale } from "@tablecast/api/schema";
import { defaultCastInstructions } from "@tablecast/api/speech";
import { ShieldCheck } from "lucide-react";
import { type ReactNode, useId } from "react";
import { Badge } from "../../components/ui/badge";
import { useI18n } from "../../i18n/locale";
import { BooleanField, ConfigurationSection } from "./configuration-fields";
import { PromptEditor } from "./prompt-editor";

export function CastSystemSettings({
  value,
  language,
  onChange,
  disabled = false,
  inputId,
  action,
}: {
  action?: ReactNode;
  disabled?: boolean;
  inputId?: string;
  language: Locale;
  onChange?: (value: Configuration["cast"]) => void;
  value: Configuration["cast"];
}) {
  const { t } = useI18n();
  const id = useId();
  const override = value.systemInstructions?.[language];
  const enabled = override != null;
  return (
    <ConfigurationSection
      title={t("cast_system_layer")}
      icon={ShieldCheck}
      headingId={`${id}-heading`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={enabled ? "warning" : "success"}>
          {t(enabled ? "cast_system_overridden" : "cast_system_default")}
        </Badge>
        <p className="text-sm text-muted-foreground">{t("cast_system_hint")}</p>
      </div>
      {onChange && (
        <BooleanField
          inputId={inputId}
          label={t("cast_system_override")}
          disabled={disabled}
          value={enabled}
          onChange={(next) =>
            onChange({
              ...value,
              systemInstructions: {
                ja: null,
                en: null,
                ...value.systemInstructions,
                [language]: next ? resolveLocalized(defaultCastInstructions, language) : null,
              },
            })
          }
        />
      )}
      {enabled && onChange ? (
        <PromptEditor
          id={`${id}-source`}
          labelledBy={`${id}-heading`}
          language={language}
          value={override}
          disabled={disabled}
          onChange={(next) =>
            onChange({
              ...value,
              systemInstructions: {
                ja: null,
                en: null,
                ...value.systemInstructions,
                [language]: instructionText(next),
              },
            })
          }
        />
      ) : (
        <textarea
          aria-labelledby={`${id}-heading`}
          lang={language}
          readOnly
          rows={6}
          className="block w-full resize-y rounded-xl border border-border bg-muted/30 p-3 text-sm leading-relaxed text-foreground"
          value={override ?? resolveLocalized(defaultCastInstructions, language)}
        />
      )}
      {enabled && !override.trim() && (
        <p role="alert" className="text-sm text-destructive">
          {t("form_required")}
        </p>
      )}
      {action && <div className="flex">{action}</div>}
    </ConfigurationSection>
  );
}
