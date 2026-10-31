import {
  type Catalog,
  type Product,
  type Snapshot,
  type TableEvent,
  voiceReferenceEventSchema,
} from "@tablecast/api/schema";
import { AnimatePresence } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "../../components/ai-elements/conversation";
import { Tool } from "../../components/ai-elements/tool";
import { ProductMenu } from "../../components/product-menu";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import {
  type ConversationLine,
  mergeConversation,
  voiceOperationState,
} from "./conversation-model";
import { LocalCamera, useLocalCamera } from "./local-camera";
import { localCameraDefaults } from "./local-camera-dom";
import { type VoiceView } from "./voice-connection";
import { VoiceAttention, VoiceControls } from "./voice-controls";
import { ConversationEntry, ConversationMessage } from "./voice-conversation-message";
import { voiceStatusLabels } from "./voice-model";
import { VoiceProgress } from "./voice-progress";
import { VoiceReferenceCard } from "./voice-reference";
import { VoiceWelcome } from "./voice-welcome";

const toolLabels: Partial<Record<string, Parameters<ReturnType<typeof useI18n>["t"]>[0]>> = {
  showReference: "kiosk_tool_show_reference",
  captureCamera: "kiosk_tool_capture_camera",
  getCameraState: "kiosk_tool_camera_state",
  getCatalog: "kiosk_tool_get_catalog",
  getServiceGuidance: "assistance_guides",
  getTableState: "kiosk_tool_get_table_state",
  updateCart: "kiosk_tool_update_cart",
  prepareConfirmation: "kiosk_tool_prepare_confirmation",
  submitOrder: "kiosk_tool_submit_order",
  callStaff: "kiosk_tool_call_staff",
  showProducts: "kiosk_tool_show_products",
  setLanguage: "kiosk_tool_set_language",
  setSpeechSpeed: "kiosk_tool_set_speech_speed",
  setUiSection: "kiosk_tool_set_ui_section",
  showMenuSearch: "kiosk_tool_menu_search",
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
  const cameraArea = useRef<HTMLDivElement>(null);
  const [cameraHeight, setCameraHeight] = useState<number>();
  // SSRも既定の映像比率・操作高11・間隔1.5と履歴までの間隔3を予約する。
  const cameraPadding =
    cameraHeight === undefined
      ? `calc(${localCameraDefaults.width / localCameraDefaults.aspectRatio}px + var(--spacing) * 15.5)`
      : `calc(${cameraHeight}px + var(--spacing) * 3)`;
  useLayoutEffect(() => {
    const element = cameraArea.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(() => setCameraHeight(element.offsetHeight));
    observer.observe(element);
    setCameraHeight(element.offsetHeight);
    return () => observer.disconnect();
  }, []);
  const { locale, t } = useI18n();
  const merged = mergeConversation(lines, view, locale);
  const { tools, turns, failedTurns, latestBusinessTurn, running } = voiceOperationState(events);
  const active = !["idle", "paused", "error", "stopping"].includes(view.status);
  const status = t(voiceStatusLabels[view.status]);
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
        <Tool
          key={String(event.data.toolCallId)}
          title={title}
          statusLabel={t(toolStatus)}
          state={
            stale
              ? "interrupted"
              : failed
                ? "error"
                : pending
                  ? event.data.state === "requested"
                    ? "requested"
                    : "running"
                  : "completed"
          }
        >
          {failed ? <p className="text-destructive">{t("kiosk_tool_failed_hint")}</p> : undefined}
        </Tool>,
      ];
    });
  }
  function products(turnId?: string) {
    if (!catalog || !onChoose) return null;
    return events.flatMap((event) =>
      event.kind === "voice.products" && event.data.turnId === turnId
        ? [
            <div
              data-ui="voice-products-entry"
              className="mt-3 min-w-0 max-w-full motion-safe:animate-tablecast-state"
              key={event.cursor}
            >
              <ProductMenu
                catalog={catalog}
                compact
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
        <div ref={cameraArea} className="pointer-events-none absolute inset-x-3 top-3 z-10">
          <LocalCamera camera={camera} boundsRef={panel} />
        </div>
        <div
          data-ui="conversation-history"
          className="flex min-h-0 flex-1 flex-col overflow-hidden @container-size/history"
        >
          <Conversation>
            <ConversationContent
              tabIndex={0}
              className="relative min-h-full"
              style={{ paddingTop: cameraPadding }}
            >
              <VoiceWelcome
                view={view}
                hasContent={Boolean(timeline.length || snapshot)}
                onStart={onStart}
                disabled={controlDisabled}
              />
              <AnimatePresence initial={false} mode="popLayout">
                {timeline.map((entry) => {
                  const line = entry.line;
                  return line ? (
                    <ConversationEntry
                      className="min-w-0 max-w-full space-y-2"
                      key={line.id}
                      pinned={line.id === merged.at(-1)?.id}
                    >
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
                    <ConversationEntry key={entry.id} className="min-w-0 max-w-full space-y-2">
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
                <div
                  data-ui="voice-suggestions-entry"
                  key={view.suggestions?.join("\u0000")}
                  className="flex flex-wrap gap-2 motion-safe:animate-tablecast-state"
                  aria-label={t("kiosk_suggestions")}
                >
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
