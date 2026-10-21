import { AudioLines } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useRef } from "react";
import type { VoicePanelProps } from "./voice-panel-state";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "../../components/ai-elements/conversation";
import { LocalCamera, useLocalCamera } from "./local-camera";
import { VoiceAttention, VoiceControls } from "./voice-controls";
import { ConversationEntry, ConversationMessage } from "./voice-conversation-message";
import { useVoicePanel } from "./voice-panel-state";

const emptyEvents: NonNullable<VoicePanelProps["events"]> = [];

export function VoicePanel({
  view,
  lines,
  onStart,
  events = emptyEvents,
  catalog,
  onChoose,
  snapshot,
  onReview,
  reviewPending = false,
  controlDisabled = false,
  speechSpeed = 1,
  onSpeedChange,
  onMicrophoneChange,
  onMicrophoneRefresh,
}: VoicePanelProps) {
  const camera = useLocalCamera();
  const panel = useRef<HTMLElement>(null);
  const {
    locale,
    t,
    merged,
    latestBusinessTurn,
    active,
    usingTools,
    visualState,
    toolPhase,
    phase,
    toolCards,
    products,
    timeline,
    liveRole,
    speakingLine,
    hasLive,
  } = useVoicePanel({ view, lines, events, catalog, onChoose });
  return (
    <section
      ref={panel}
      className="relative flex h-full min-h-0 min-w-0 flex-col gap-2 overflow-hidden p-3 @container"
      data-theme-part="conversation"
      aria-label={t("kiosk_conversation")}
    >
      <h2 className="sr-only">{t("kiosk_conversation")}</h2>
      <div className="min-w-0 shrink-0">
        <LocalCamera camera={camera} boundsRef={panel} />
      </div>
      <div data-ui="conversation-history" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Conversation>
          <ConversationContent tabIndex={0} className="relative">
            {merged.length === 0 && !active && (
              <div className="flex flex-col items-start gap-3 py-5">
                <AudioLines className="size-10 text-muted-foreground" strokeWidth={1.2} />
                <h1 className="whitespace-pre-line font-serif text-xl leading-relaxed">
                  {t("kiosk_welcome")}
                </h1>
              </div>
            )}
            <AnimatePresence initial={false} mode="popLayout">
              {timeline.map((entry) => {
                const line = entry.line;
                return line ? (
                  <ConversationEntry className="space-y-2" key={line.id}>
                    <ConversationMessage
                      line={line}
                      status={
                        line === speakingLine
                          ? t("kiosk_voice_speaking")
                          : line.live
                            ? line.role === "user"
                              ? t("kiosk_transcribing")
                              : t("kiosk_reply_generating")
                            : undefined
                      }
                    />
                  </ConversationEntry>
                ) : (
                  <ConversationEntry key={entry.id} className="w-11/12 space-y-2">
                    {toolCards(entry.turnId)}
                    {products(entry.turnId)}
                  </ConversationEntry>
                );
              })}
              {active && !hasLive && (
                <ConversationEntry key="activity">
                  <ConversationMessage
                    status={phase}
                    line={{
                      id: "activity",
                      role: liveRole,
                      text: "",
                      locale,
                      createdAt: 0,
                      interrupted: false,
                      live: true,
                    }}
                  />
                </ConversationEntry>
              )}
            </AnimatePresence>
            <VoiceAttention
              snapshot={snapshot}
              onReview={onReview}
              reviewPending={reviewPending}
              events={events}
              latestBusinessTurn={latestBusinessTurn}
              view={view}
            />
          </ConversationContent>
          <ConversationScrollButton label={t("kiosk_latest")} followLabel={t("kiosk_following")} />
        </Conversation>
      </div>
      <VoiceControls
        view={view}
        active={active}
        phase={phase}
        visualState={visualState}
        toolLabel={usingTools ? toolPhase : undefined}
        onStart={onStart}
        controlDisabled={controlDisabled}
        speechSpeed={speechSpeed}
        onSpeedChange={onSpeedChange}
        onMicrophoneChange={onMicrophoneChange}
        onMicrophoneRefresh={onMicrophoneRefresh}
      />
    </section>
  );
}
