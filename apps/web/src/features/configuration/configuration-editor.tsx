import { type Configuration, type Locale } from "@tablecast/api/schema";
import { AudioLines, MessageSquare } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { CastTarget } from "./menu-model";
import { useI18n } from "../../i18n/locale";
import { CastSystemSettings } from "./cast-system-settings";
import { BooleanField, ConfigurationSection } from "./configuration-fields";
import { LanguageFields } from "./language-fields";
import { PromptEditor } from "./prompt-editor";
import { StandardVoiceSelect } from "./standard-voice-select";
import { StoreKnowledge } from "./store-knowledge";

export function CastEditor({
  storeId,
  value,
  voices,
  onChange,
  disabled,
  focusTarget,
}: {
  disabled: boolean;
  focusTarget?: CastTarget;
  onChange: (value: Configuration["cast"]) => void;
  storeId: string;
  value: Configuration["cast"];
  voices: Configuration["cast"]["voice"][];
}) {
  const id = useId();
  const { t, locale } = useI18n();
  const targetLanguage = Object.keys(value.instructions).find((language) =>
    focusTarget?.endsWith(`-${language}`),
  );
  const [selection, setSelection] = useState({
    target: focusTarget,
    language: targetLanguage ?? locale,
  });
  const language =
    selection.target === focusTarget ? selection.language : (targetLanguage ?? selection.language);
  const focusedTarget = useRef<CastTarget | undefined>(undefined);
  useEffect(() => {
    if (!focusTarget || focusedTarget.current === focusTarget) return;
    document.getElementById(`${id}-${focusTarget}`)?.focus();
    focusedTarget.current = focusTarget;
  }, [focusTarget, id]);
  return (
    <div className="min-w-0 space-y-6">
      <LanguageFields
        value={language}
        onValueChange={(next: Locale) => setSelection({ target: focusTarget, language: next })}
      >
        {(itemLanguage, languageLabelId) => (
          <>
            <CastSystemSettings
              value={value}
              language={itemLanguage}
              onChange={onChange}
              disabled={disabled}
              inputId={`${id}-system-${itemLanguage}`}
            />
            <h2 className="text-lg font-semibold">{t("cast_store_layer")}</h2>
            <ConfigurationSection
              title={t("editor_cast_instructions")}
              icon={MessageSquare}
              headingId={`${id}-${itemLanguage}-instructions`}
            >
              <p className="text-sm text-muted-foreground">{t("editor_cast_instructions_hint")}</p>
              <PromptEditor
                id={`${id}-instructions-${itemLanguage}`}
                labelledBy={`${languageLabelId} ${id}-${itemLanguage}-instructions`}
                language={itemLanguage}
                value={value.instructions[itemLanguage] ?? ""}
                disabled={disabled}
                onChange={(instructions) =>
                  onChange({
                    ...value,
                    instructions: { ...value.instructions, [itemLanguage]: instructions },
                  })
                }
              />
            </ConfigurationSection>
            <ConfigurationSection
              title={t("editor_cast_opening")}
              icon={MessageSquare}
              headingId={`${id}-${itemLanguage}-opening`}
            >
              <p className="text-sm text-muted-foreground">{t("editor_cast_opening_hint")}</p>
              <textarea
                id={`${id}-opening-${itemLanguage}`}
                lang={itemLanguage}
                aria-labelledby={`${languageLabelId} ${id}-${itemLanguage}-opening`}
                className="min-h-28 w-full rounded-xl border border-input bg-card p-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
                maxLength={2000}
                disabled={disabled}
                value={value.openingInstructions?.[itemLanguage] ?? ""}
                onChange={(event) =>
                  onChange({
                    ...value,
                    openingInstructions: {
                      ja: "",
                      en: "",
                      ...value.openingInstructions,
                      [itemLanguage]: event.target.value,
                    },
                  })
                }
              />
            </ConfigurationSection>
            <ConfigurationSection title={t("editor_cast_voice_group")} icon={AudioLines}>
              <StandardVoiceSelect
                storeId={storeId}
                inputId={`${id}-voice-${itemLanguage}`}
                language={itemLanguage}
                labelledBy={languageLabelId}
                value={value.voice[itemLanguage] ?? null}
                retained={voices.flatMap((voice) =>
                  voice[itemLanguage] === undefined ? [] : [voice[itemLanguage] ?? null],
                )}
                disabled={disabled}
                onChange={(voiceId) =>
                  onChange({ ...value, voice: { ...value.voice, [itemLanguage]: voiceId } })
                }
              />
            </ConfigurationSection>
          </>
        )}
      </LanguageFields>
      <div id={`${id}-knowledge`} tabIndex={-1}>
        <StoreKnowledge
          value={value.skills ?? []}
          onChange={(skills) => onChange({ ...value, skills })}
          disabled={disabled}
        />
      </div>
      <section className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card p-4 sm:p-5">
        <MessageSquare className="mt-3 size-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <BooleanField
            inputId={`${id}-proactive`}
            label={t("editor_proactive")}
            value={value.proactive}
            disabled={disabled}
            onChange={(proactive) => onChange({ ...value, proactive })}
          />
          <p className="text-sm text-muted-foreground">{t("editor_cast_proactive_hint")}</p>
        </div>
      </section>
    </div>
  );
}
