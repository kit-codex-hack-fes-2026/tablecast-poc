import type { Configuration, Locale } from "@tablecast/api/schema";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Maximize2, MessageSquareText, Mic, Sparkles } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogScroll,
  DialogFooter,
} from "../../components/ui/dialog";
import { standardVoicesOptions } from "./menu-query";

export type CastTarget =
  | "instructions-ja"
  | "instructions-en"
  | "voice-ja"
  | "voice-en"
  | "proactive";

export function CastOverview({
  storeId,
  value,
  renderEdit,
}: {
  storeId: string;
  value: Configuration["cast"];
  renderEdit?: (target: CastTarget) => ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="max-w-5xl space-y-8">
      <section className="space-y-5 border-t border-border pt-6">
        <div className="space-y-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <MessageSquareText className="size-5" aria-hidden="true" />
            {t("editor_cast_instructions")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("cast_instructions_note")}</p>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {(["ja", "en"] as const).map((language) => (
            <InstructionOverview
              key={language}
              language={language}
              value={value.instructions[language]}
              action={renderEdit?.(`instructions-${language}`)}
            />
          ))}
        </div>
      </section>
      <section className="space-y-5 border-t border-border pt-6">
        <div className="space-y-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Mic className="size-5" aria-hidden="true" />
            {t("editor_voice")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("cast_voice_note")}</p>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {(["ja", "en"] as const).map((language) => (
            <section key={language} className="min-w-0 space-y-3">
              <h3 className="font-semibold">{t(language === "ja" ? "common_ja" : "common_en")}</h3>
              <VoiceOverview storeId={storeId} language={language} value={value.voice[language]} />
              {renderEdit?.(`voice-${language}`)}
            </section>
          ))}
        </div>
      </section>
      <section className="space-y-4 border-t border-border pt-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="size-5" aria-hidden="true" />
          {t("editor_proactive")}
        </h2>
        <Badge variant={value.proactive ? "success" : "inactive"}>
          {t(value.proactive ? "cast_proactive_on" : "cast_proactive_off")}
        </Badge>
        <p className="text-sm text-muted-foreground">{t("cast_proactive_note")}</p>
        {renderEdit?.("proactive")}
      </section>
    </div>
  );
}

function InstructionOverview({
  language,
  value,
  action,
}: {
  language: Locale;
  value: string;
  action?: ReactNode;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  return (
    <section className="min-w-0 space-y-3">
      <h3 className="font-semibold">{t(language === "ja" ? "common_ja" : "common_en")}</h3>
      {value.trim() ? (
        <>
          <p
            lang={language}
            className="line-clamp-4 whitespace-pre-wrap wrap-anywhere leading-relaxed"
          >
            {value}
          </p>
          <Button
            type="button"
            variant="ghost"
            aria-haspopup="dialog"
            onClick={() => setExpanded(true)}
          >
            <Maximize2 />
            {t("cast_show_full")}
          </Button>
          <Dialog open={expanded} onOpenChange={setExpanded}>
            <DialogContent initialFocus={content}>
              <DialogTitle>{t("editor_cast_instructions")}</DialogTitle>
              <DialogDescription>
                {t(language === "ja" ? "common_ja" : "common_en")}
              </DialogDescription>
              <DialogScroll
                ref={content}
                tabIndex={0}
                className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <p lang={language} className="whitespace-pre-wrap wrap-anywhere leading-relaxed">
                  {value}
                </p>
              </DialogScroll>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setExpanded(false)}>
                  {t("common_close")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <p className="text-muted-foreground">{t("cast_instructions_unset")}</p>
      )}
      <div>{action}</div>
    </section>
  );
}

function VoiceOverview({
  storeId,
  language,
  value,
}: {
  storeId: string;
  language: Locale;
  value: string | null;
}) {
  const { t } = useI18n();
  const voices = useInfiniteQuery(standardVoicesOptions(storeId, language));
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
      <ErrorNotice error={voices.error} onRetry={() => void voices.refetch()} />
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
