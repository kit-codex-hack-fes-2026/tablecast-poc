import type { ReactNode } from "react";
import { resolveLocalized } from "@tablecast/api/localization";
import { type Configuration, instructionText, type Locale } from "@tablecast/api/schema";
import { useInfiniteQuery } from "@tanstack/react-query";
import { MessageSquareText, Mic, Sparkles } from "lucide-react";
import type { CastTarget } from "./menu-model";
import { ErrorNotice } from "../../components/error-notice";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { CastSystemSettings } from "./cast-system-settings";
import { ConfigurationSection } from "./configuration-fields";
import { InstructionView } from "./instruction-view";
import { LanguageFields } from "./language-fields";
import { standardVoicesOptions } from "./menu-query";
import { StoreKnowledge } from "./store-knowledge";

export function CastOverview({
  storeId,
  value,
  renderEdit,
}: {
  renderEdit?: (target: CastTarget) => ReactNode;
  storeId: string;
  value: Configuration["cast"];
}) {
  const { t } = useI18n();
  return (
    <div className="max-w-5xl space-y-8">
      <LanguageFields languages={Object.keys(value.instructions)}>
        {(language) => (
          <>
            <CastSystemSettings
              value={value}
              language={language}
              action={renderEdit?.(`system-${language}`)}
            />
            <h2 className="text-lg font-semibold">{t("cast_store_layer")}</h2>
            <ConfigurationSection title={t("editor_cast_instructions")} icon={MessageSquareText}>
              <div lang={language} className="min-w-0">
                {instructionText(resolveLocalized(value.instructions, language)).trim() ? (
                  <InstructionView value={resolveLocalized(value.instructions, language)} />
                ) : (
                  <p className="text-muted-foreground">{t("cast_instructions_unset")}</p>
                )}
              </div>
              <div className="flex">{renderEdit?.(`instructions-${language}`)}</div>
            </ConfigurationSection>
            <ConfigurationSection title={t("editor_cast_opening")} icon={MessageSquareText}>
              <p lang={language} className="whitespace-pre-wrap text-sm leading-relaxed">
                {value.openingInstructions?.[language] || t("cast_opening_default")}
              </p>
              <div className="flex">{renderEdit?.(`opening-${language}`)}</div>
            </ConfigurationSection>
            <ConfigurationSection title={t("editor_cast_voice_group")} icon={Mic}>
              <VoiceOverview
                storeId={storeId}
                language={language}
                value={resolveLocalized(value.voice, language)}
              />
              <div className="flex">{renderEdit?.(`voice-${language}`)}</div>
            </ConfigurationSection>
          </>
        )}
      </LanguageFields>
      <StoreKnowledge
        storeId={storeId}
        value={value.skills ?? []}
        action={renderEdit?.("knowledge")}
      />
      <ConfigurationSection title={t("editor_proactive")} icon={Sparkles}>
        <Badge variant={value.proactive ? "success" : "inactive"}>
          {t(value.proactive ? "cast_proactive_on" : "cast_proactive_off")}
        </Badge>
        <p className="text-sm text-muted-foreground">{t("editor_cast_proactive_hint")}</p>
        <div className="flex">{renderEdit?.("proactive")}</div>
      </ConfigurationSection>
    </div>
  );
}

function VoiceOverview({
  storeId,
  language,
  value,
}: {
  language: Locale;
  storeId: string;
  value: null | string;
}) {
  const { t } = useI18n();
  const voices = useInfiniteQuery({
    ...standardVoicesOptions(storeId, language),
    retryOnMount: false,
  });
  const voice = voices.data?.pages
    .flatMap((page) => page.voices)
    .find((item) => item.voiceId === value);
  return (
    <div className="space-y-2">
      <p className="wrap-anywhere font-medium">
        {value === null ? t("cast_voice_unset") : (voice?.displayName ?? value)}
      </p>
      {value === null ? (
        <p className="text-sm text-muted-foreground">{t("voice_default_marin")}</p>
      ) : !voice && voices.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("common_loading")}
        </p>
      ) : !voice && voices.data && !voices.hasNextPage ? (
        <>
          <Badge variant="inactive">{t("cast_voice_unavailable")}</Badge>
          <p className="text-sm text-muted-foreground">{t("cast_voice_unavailable_note")}</p>
        </>
      ) : null}
      <ErrorNotice query={voices} />
      {value && !voice && voices.hasNextPage && (
        <Button
          type="button"
          variant="outline"
          disabled={voices.isFetching}
          onClick={() => void voices.fetchNextPage()}
        >
          {t(voices.isFetching ? "common_loading" : "voice_catalog_more")}
        </Button>
      )}
    </div>
  );
}
