import { Button } from "../../components/ui/button";
import { ArrowDown, AudioLines, Mic, MicOff } from "lucide-react";
import { useRef, useState } from "react";
import type { TableEvent } from "@tablecast/api/schema";
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
    <section className="voice-panel" aria-label={t("kiosk_conversation")}>
      <output className="sr-only" aria-live="polite" aria-atomic="true">
        {lines.at(-1)?.text}
      </output>
      <div className="cast-heading">
        <h2>{t("kiosk_conversation")}</h2>
        {view.status !== "idle" && (
          <span className={`voice-indicator ${view.status}`}>
            <span aria-hidden="true" />
            {status}
          </span>
        )}
      </div>
      <div
        className="conversation-scroll"
        onScroll={(event) => {
          const el = event.currentTarget;
          setAway(el.scrollHeight - el.scrollTop - el.clientHeight > 90);
        }}
      >
        {lines.length === 0 ? (
          <div className="welcome">
            <div className="welcome-symbol" aria-hidden="true">
              <AudioLines size={38} strokeWidth={1.2} />
            </div>
            <h1>{t("kiosk_welcome")}</h1>
            {(view.status === "idle" || view.status === "paused") && (
              <Button
                variant="default"
                size="lg"
                type="button"
                className="primary-button"
                onClick={onStart}
              >
                <Mic size={20} aria-hidden="true" />
                {t("kiosk_voice_start")}
              </Button>
            )}
          </div>
        ) : (
          <div className="conversation-lines">
            {lines.map((line) => (
              <article
                key={line.id}
                className={`conversation-line ${line.role}`}
                lang={line.locale}
              >
                <div className="line-meta">
                  <span>
                    {line.role === "assistant" ? t("kiosk_assistant") : t("kiosk_guest")}
                    {line.speaker && ` · ${t("kiosk_speaker")} ${line.speaker}`}
                  </span>
                  <span>
                    {line.locale === "ja" ? "日本語" : "English"} · {time(line.createdAt, locale)}
                  </span>
                </div>
                <p>{line.text}</p>
                {line.synthetic && <small>{t("common_synthetic")}</small>}
                {line.interrupted && <small>{t("kiosk_interrupted")}</small>}
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
          className="latest-button"
          onClick={() => endRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" })}
        >
          <ArrowDown size={16} aria-hidden="true" />
          {t("kiosk_latest")}
        </Button>
      )}
      {view.interim && (
        <div className="interim">
          <span>{t("kiosk_transcribing")}</span>
          <p>{view.interim}</p>
        </div>
      )}
      {view.status === "error" && (
        <output className="voice-error">
          <MicOff size={20} aria-hidden="true" />
          <div>
            <strong>
              {view.error === "active"
                ? t("kiosk_voice_already_active")
                : view.error === "permission"
                  ? t("kiosk_voice_permission")
                  : view.error === "unconfigured"
                    ? t("kiosk_voice_setup")
                    : t("kiosk_voice_error")}
            </strong>
            <p>{t("kiosk_voice_fallback")}</p>
          </div>
        </output>
      )}
      {view.status === "paused" && (
        <div className="paused-note">
          <MicOff size={17} aria-hidden="true" />
          {t("kiosk_voice_paused")} · {t("kiosk_voice_fallback")}
        </div>
      )}
      <footer className="conversation-footer">
        <span className="tiny-dot" aria-hidden="true" />
        {t("kiosk_voice_privacy")}
      </footer>
    </section>
  );
}
