import {
  type Catalog,
  type Product,
  type Snapshot,
  type TableEvent,
  voiceReferenceEventSchema,
} from "@tablecast/api/schema";
import { Check, CircleAlert, LoaderCircle, MicOff } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useRef } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "../../components/ai-elements/conversation";
import { ProductMenu } from "../../components/product-menu";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import {
  type ConversationLine,
  mergeConversation,
  voiceOperationState,
} from "./conversation-model";
import { LocalCamera, useLocalCamera } from "./local-camera";
import { type VoiceView } from "./voice-connection";
import { VoiceAttention, VoiceControls, VoiceStartBanner } from "./voice-controls";
import { ConversationEntry, ConversationMessage } from "./voice-conversation-message";
import { VoiceProgress } from "./voice-progress";
import { VoiceReferenceCard } from "./voice-reference";

const toolLabels: Partial<Record<string, Parameters<ReturnType<typeof useI18n>["t"]>[0]>> = {
  showReference: "kiosk_tool_show_reference",
  captureCamera: "kiosk_tool_capture_camera",
  getCatalog: "kiosk_tool_get_catalog",
  getTableState: "kiosk_tool_get_table_state",
  updateCart: "kiosk_tool_update_cart",
  prepareConfirmation: "kiosk_tool_prepare_confirmation",
  submitOrder: "kiosk_tool_submit_order",
  callStaff: "kiosk_tool_call_staff",
  showProducts: "kiosk_tool_show_products",
  setLanguage: "kiosk_tool_set_language",
  setSpeechSpeed: "kiosk_tool_set_speech_speed",
  setUiSection: "kiosk_tool_set_ui_section",
};

export type VoicePanelProps = {
  catalog?: Catalog;
  controlDisabled?: boolean;
  events?: TableEvent[];
  lines: ConversationLine[];
  onChoose?: (product: Product) => void;
  onMicrophoneChange?: (deviceId: string) => void;
  onMicrophoneRefresh?: () => void;
  onReview?: () => void;
  onSpeedChange?: (value: number) => void;
  onStart: () => void;
  onSuggestion?: (text: string, source: string[] | undefined) => void;
  reviewPending?: boolean;
  snapshot?: null | Snapshot;
  speechSpeed?: number;
  view: VoiceView;
};

function conversationTimeline(merged: ConversationLine[], events: TableEvent[]) {
  const timeline: { createdAt: number; id: string; line?: ConversationLine; turnId?: string }[] =
    merged.map((line) => ({ id: line.id, createdAt: line.createdAt, line }));
  // 字幕の表示IDと業務turnを結び付けず、操作と商品カードを一か所に並べる。
  for (const turnId of new Set(
    events.flatMap((event) =>
      (event.kind === "voice.tool" ||
        event.kind === "voice.products" ||
        event.kind === "voice.reference") &&
      typeof event.data.turnId === "string"
        ? [event.data.turnId]
        : [],
    ),
  )) {
    const first = events.find(
      (event) =>
        (event.kind === "voice.tool" ||
          event.kind === "voice.products" ||
          event.kind === "voice.reference") &&
        event.data.turnId === turnId,
    );
    if (first)
      timeline.push({ id: `operation-${first.cursor}`, createdAt: first.createdAt, turnId });
  }
  timeline.sort((left, right) => left.createdAt - right.createdAt);
  return timeline;
}

const emptyEvents: NonNullable<VoicePanelProps["events"]> = [];
export function VoicePanel(props: VoicePanelProps) {
  const camera = useLocalCamera();
  return <VoicePanelContent {...props} camera={camera} />;
}
export function VoicePanelContent({
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
  onSuggestion,
  camera,
}: VoicePanelProps & { camera: ReturnType<typeof useLocalCamera> }) {
  const panel = useRef<HTMLElement>(null);
  const { locale, t } = useI18n();
  const merged = mergeConversation(lines, view, locale);
  const { tools, turns, failedTurns, latestBusinessTurn, running } = voiceOperationState(events);
  const active = !["idle", "paused", "error", "stopping"].includes(view.status);
  const status = {
    idle: t("kiosk_voice_paused"),
    paused: t("kiosk_voice_paused"),
    connecting: t("kiosk_voice_connecting"),
    listening: t("kiosk_voice_listening"),
    thinking: t("kiosk_voice_thinking"),
    speaking: t("kiosk_voice_speaking"),
    stopping: t("kiosk_voice_stopping"),
    error: t("kiosk_voice_error"),
  }[view.status];
  const usingTools =
    running.length > 0 && (view.status === "thinking" || view.status === "speaking");
  const visualState: "tool" | VoiceView["status"] =
    usingTools && view.status === "thinking" ? "tool" : view.status;
  const activeToolLabels = new Set<string>();
  for (const event of running) {
    const key =
      typeof event.data.toolName === "string" ? toolLabels[event.data.toolName] : undefined;
    if (key) activeToolLabels.add(t(key));
  }
  const toolPhase =
    [...activeToolLabels].join(t("kiosk_tool_separator")) || t("kiosk_tools_working");
  const phase = visualState === "tool" ? toolPhase : status;
  function toolCards(turnId?: string) {
    return [...tools.values()].flatMap((event) => {
      if (event.data.turnId !== turnId) return [];
      const pending = event.data.state === "requested" || event.data.state === "running";
      const turn = turnId ? turns.get(turnId) : undefined;
      const cancelled = event.data.errorCode === "VOICE_CANCELLED";
      const failed =
        !cancelled && (event.data.state === "error" || (pending && failedTurns.has(turnId)));
      const stale =
        cancelled || (pending && !failed && (!active || (turn && turn.data.status !== "started")));
      const name = typeof event.data.toolName === "string" ? event.data.toolName : "";
      const title = t(toolLabels[name] ?? "kiosk_tool_action");
      let toolStatus: Parameters<ReturnType<typeof useI18n>["t"]>[0] = "kiosk_tool_complete";
      if (failed) toolStatus = "kiosk_tool_failed";
      else if (stale) toolStatus = "kiosk_tool_interrupted";
      else if (event.data.state === "requested") toolStatus = "kiosk_tool_waiting";
      else if (pending) toolStatus = "kiosk_tool_running";
      return [
        <div
          key={String(event.data.toolCallId)}
          className="flex items-start gap-3 rounded-lg border border-border bg-background px-3 py-2 text-xs"
          data-tool-state={stale ? "interrupted" : failed ? "error" : String(event.data.state)}
        >
          <span key={toolStatus} className="shrink-0 motion-safe:animate-tablecast-confirm">
            {failed ? (
              <CircleAlert className="size-4 text-destructive" />
            ) : pending && !stale ? (
              <LoaderCircle className="size-4 motion-safe:animate-spin text-primary" />
            ) : stale ? (
              <MicOff className="size-4" />
            ) : (
              <Check className="size-4 text-success" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            {title}
            {name === "getCatalog" && typeof event.data.query === "string" && (
              <span className="mt-1 block wrap-break-word text-muted-foreground">
                {t("kiosk_tool_search_label")}
                {event.data.query}
              </span>
            )}
            {failed && (
              <span className="mt-1 block text-destructive">{t("kiosk_tool_failed_hint")}</span>
            )}
          </span>
          <span className="shrink-0 text-muted-foreground">{t(toolStatus)}</span>
        </div>,
      ];
    });
  }
  function products(turnId?: string) {
    if (!catalog || !onChoose) return null;
    return events.flatMap((event) =>
      event.kind === "voice.products" && event.data.turnId === turnId
        ? [
            <div className="mt-3" key={event.cursor}>
              <ProductMenu
                catalog={catalog}
                productIds={
                  Array.isArray(event.data.productIds)
                    ? event.data.productIds.filter((id): id is string => typeof id === "string")
                    : []
                }
                onChoose={onChoose}
              />
            </div>,
          ]
        : [],
    );
  }
  const timeline = conversationTimeline(merged, events);
  const liveRole: ConversationLine["role"] = view.status === "listening" ? "user" : "assistant";
  const speakingLine =
    view.status === "speaking"
      ? [...merged].toReversed().find((line) => line.role === "assistant")
      : undefined;
  const hasLive =
    Boolean(speakingLine) || merged.some((line) => line.live && line.role === liveRole);
  function renderPanel() {
    return (
      <section
        ref={panel}
        className="relative flex h-full min-h-0 min-w-0 flex-col gap-2 overflow-hidden p-3 font-sans! @container [&_*]:font-sans!"
        data-theme-part="conversation"
        aria-label={t("kiosk_conversation")}
      >
        <h2 className="sr-only">{t("kiosk_conversation")}</h2>
        <div className="pointer-events-none absolute inset-x-3 top-3 z-10">
          <LocalCamera camera={camera} boundsRef={panel} />
        </div>
        <div
          data-ui="conversation-history"
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <Conversation>
            <ConversationContent tabIndex={0} className="relative">
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
                    <ConversationEntry key={entry.id} className="w-full space-y-2">
                      {toolCards(entry.turnId)}
                      {products(entry.turnId)}
                      {events
                        .filter(
                          (event) =>
                            event.kind === "voice.reference" && event.data.turnId === entry.turnId,
                        )
                        .map((event) => {
                          const parsed = voiceReferenceEventSchema.safeParse(event.data);
                          return parsed.success ? (
                            <VoiceReferenceCard
                              key={event.cursor}
                              reference={parsed.data.reference}
                            />
                          ) : null;
                        })}
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
              {active && Boolean(view.suggestions?.length) && (
                <div className="flex flex-wrap gap-2" aria-label={t("kiosk_suggestions")}>
                  {view.suggestions?.map((text) => (
                    <Button
                      key={text}
                      variant="outline"
                      size="lg"
                      className="h-auto max-w-full whitespace-normal text-left text-sm"
                      disabled={view.status !== "listening" || !onSuggestion}
                      onClick={() => onSuggestion?.(text, view.suggestions)}
                    >
                      {text}
                    </Button>
                  ))}
                </div>
              )}
              <VoiceProgress view={view} />
            </ConversationContent>
            <ConversationScrollButton label={t("kiosk_latest")} />
          </Conversation>
        </div>
        {!active && (
          <div
            data-ui="voice-start-overlay"
            className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-radial from-inverse/35 via-inverse/15 to-transparent"
          >
            <VoiceStartBanner view={view} onStart={onStart} controlDisabled={controlDisabled} />
          </div>
        )}
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
  return renderPanel();
}
