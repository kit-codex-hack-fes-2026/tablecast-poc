import type { TableEvent } from "@tablecast/api/schema";
import { ArrowDown, AudioLines, Mic, MicOff } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { time, useI18n } from "../../i18n/locale";
import type { VoiceView } from "./voice-connection";

export type ConversationLine = {
  id: string;
  role: "user" | "assistant";
  text: string;
  locale: "ja" | "en";
  createdAt: number;
  interrupted: boolean;
  speaker?: string;
  synthetic?: boolean;
};

export function conversationLines(events: TableEvent[]): ConversationLine[] {
  return events.flatMap((event) => {
    const data = event.data;
    if (
      (data.role !== "user" && data.role !== "assistant") ||
      typeof data.text !== "string" ||
      (data.locale !== "ja" && data.locale !== "en")
    )
      return [];
    return [
      {
        id: String(event.cursor),
        role: data.role,
        text: data.text,
        locale: data.locale,
        createdAt: event.createdAt,
        interrupted: data.interrupted === true,
        synthetic: typeof data.source === "string" && data.source.startsWith("synthetic-"),
        speaker:
          data.speaker &&
          typeof data.speaker === "object" &&
          "id" in data.speaker &&
          typeof data.speaker.id === "string"
            ? data.speaker.id
            : undefined,
      },
    ];
  });
}

export function VoicePanel({
  view,
  lines,
  onStart,
}: {
  view: VoiceView;
  lines: ConversationLine[];
  onStart: () => void;
}) {
  const { locale, t } = useI18n();
  const endRef = useRef<HTMLDivElement>(null);
  const [away, setAway] = useState(false);
  const status = {
    idle: "",
    paused: t("kiosk_voice_paused"),
    connecting: t("kiosk_voice_connecting"),
    listening: t("kiosk_voice_listening"),
    thinking: t("kiosk_voice_thinking"),
    speaking: t("kiosk_voice_speaking"),
    stopping: t("kiosk_voice_stopping"),
    error: t("kiosk_voice_error"),
  }[view.status];
  return (
    <section
      className="col-span-3 relative flex flex-col min-h-0 min-w-0 pt-7 px-7 pb-0 2xl:px-14 max-xl:pt-6 max-xl:px-6 max-xl:pb-0 max-lg:h-112 max-lg:min-h-96 max-lg:pt-6 max-lg:px-6 max-lg:pb-0 max-sm:px-5"
      aria-label={t("kiosk_conversation")}
    >
      <output className="sr-only" aria-live="polite" aria-atomic="true">
        {lines.at(-1)?.text}
      </output>
      <div className="flex items-center gap-3 pb-6 border-b border-b-border max-lg:pb-4 max-sm:gap-2">
        <h2 className="text-sm mt-1 font-medium max-sm:text-xs">{t("kiosk_conversation")}</h2>
        {view.status !== "idle" && (
          <span
            data-status={view.status}
            className="group ml-auto inline-flex max-w-40 items-center gap-2 text-right text-xs text-muted-foreground max-sm:max-w-none"
          >
            <span
              className="size-1.5 shrink-0 rounded-full bg-muted-foreground group-data-[status=listening]:bg-success group-data-[status=listening]:ring-4 group-data-[status=listening]:ring-success/10 group-data-[status=speaking]:bg-success group-data-[status=speaking]:ring-4 group-data-[status=speaking]:ring-success/10 group-data-[status=error]:bg-accent"
              aria-hidden="true"
            />
            {status}
          </span>
        )}
      </div>
      <div
        className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:thin]"
        onScroll={(event) => {
          const el = event.currentTarget;
          setAway(el.scrollHeight - el.scrollTop - el.clientHeight > 90);
        }}
      >
        {lines.length === 0 ? (
          <div className="flex min-h-full flex-col items-start justify-center px-4 py-6 2xl:px-10 max-lg:py-5">
            <div className="text-muted-foreground flex mb-5 max-lg:hidden" aria-hidden="true">
              <AudioLines size={38} strokeWidth={1.2} />
            </div>
            <h1 className="whitespace-pre-line font-serif text-4xl font-normal leading-relaxed tracking-tighter mt-4 mx-0 mb-4 max-lg:text-3xl max-lg:my-2.5 max-lg:mx-0 max-sm:text-2xl">
              {t("kiosk_welcome")}
            </h1>
            {(view.status === "idle" || view.status === "paused") && (
              <Button
                variant="default"
                size="lg"
                type="button"

                className="mt-6 min-w-44 max-lg:mt-4"
                onClick={onStart}
              >
                <Mic size={20} aria-hidden="true" />
                {t("kiosk_voice_start")}
              </Button>
            )}
          </div>
        ) : (
          <div className="py-6 px-0 flex flex-col gap-5">
            {lines.map((line) => (
              <article
                key={line.id}
                data-role={line.role}
                className="group w-11/12 data-[role=user]:ml-auto"
                lang={line.locale}
              >
                <div className="flex items-baseline justify-between gap-2 mb-1.5 py-0 px-0.5 text-xs text-muted-foreground [&_>_span:first-child]:font-semibold [&_>_span:first-child]:text-muted-foreground">
                  <span>
                    {line.role === "assistant" ? t("kiosk_assistant") : t("kiosk_guest")}
                    {line.speaker && ` · ${t("kiosk_speaker")} ${line.speaker}`}
                  </span>
                  <span>
                    {line.locale === "ja" ? "日本語" : "English"} · {time(line.createdAt, locale)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap rounded-xl rounded-tl-sm border border-border bg-card px-4 py-4 text-sm leading-loose group-data-[role=user]:rounded-tl-xl group-data-[role=user]:rounded-tr-sm group-data-[role=user]:bg-secondary">
                  {line.text}
                </p>
                {line.synthetic && (
                  <small className="mt-1 block text-xs text-muted-foreground">
                    {t("common_synthetic")}
                  </small>
                )}
                {line.interrupted && (
                  <small className="mt-1 block text-xs text-muted-foreground">
                    {t("kiosk_interrupted")}
                  </small>
                )}
              </article>
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>
      {away && (
        <Button
          variant="ghost"
          type="button"
          className="self-center flex gap-1.5 items-center min-h-11 py-2 px-4 mb-2 border border-border rounded-2xl bg-card text-xs"
          onClick={() => endRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" })}
        >
          <ArrowDown size={16} aria-hidden="true" />
          {t("kiosk_latest")}
        </Button>
      )}
      {view.interim && (
        <div className="py-3.5 px-4 bg-secondary rounded-lg mb-3">
          <span className="text-xs text-muted-foreground">{t("kiosk_transcribing")}</span>
          <p className="text-sm mt-1">{view.interim}</p>
        </div>
      )}
      {view.status === "error" && (
        <output className="flex items-start gap-2.5 bg-accent-soft text-accent-foreground p-3.5 rounded-lg mt-2.5 mx-0 mb-1.5 [&_svg]:shrink-0 [&_svg]:mt-0.5">
          <MicOff size={20} aria-hidden="true" />
          <div>
            <strong className="text-xs font-medium">
              {view.error === "active"
                ? t("kiosk_voice_already_active")
                : view.error === "permission"
                  ? t("kiosk_voice_permission")
                  : view.error === "unconfigured"
                    ? t("kiosk_voice_setup")
                    : t("kiosk_voice_error")}
            </strong>
            <p className="text-xs mt-1">{t("kiosk_voice_fallback")}</p>
          </div>
        </output>
      )}
      {view.status === "paused" && (
        <div className="flex items-start justify-center gap-2 pt-3 px-0 pb-0.5 text-xs text-muted-foreground [&_svg]:shrink-0">
          <MicOff size={17} aria-hidden="true" />
          {t("kiosk_voice_paused")} · {t("kiosk_voice_fallback")}
        </div>
      )}
      <footer className="flex items-center justify-center gap-1.5 py-4 px-0 text-xs text-muted-foreground border-t border-t-border mt-3 max-lg:py-3 max-lg:px-0">
        <span
          className="inline-block w-1.5 h-1.5 bg-current rounded-full shrink-0"
          aria-hidden="true"
        />
        {t("kiosk_voice_privacy")}
      </footer>
    </section>
  );
}
