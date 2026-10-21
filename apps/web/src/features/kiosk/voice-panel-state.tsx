import type { Catalog, Product, Snapshot, TableEvent } from "@tablecast/api/schema";
import { Check, CircleAlert, LoaderCircle, MicOff } from "lucide-react";
import type { VoiceView } from "./voice-connection";
import { ProductMenu } from "../../components/product-menu";
import { useI18n } from "../../i18n/locale";
import { type ConversationLine, mergeConversation } from "./conversation-model";

const toolLabels: Partial<Record<string, Parameters<ReturnType<typeof useI18n>["t"]>[0]>> = {
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
  reviewPending?: boolean;
  snapshot?: null | Snapshot;
  speechSpeed?: number;
  view: VoiceView;
};

export function useVoicePanel({
  view,
  lines,
  events = [],
  catalog,
  onChoose,
}: Pick<VoicePanelProps, "catalog" | "events" | "lines" | "onChoose" | "view">) {
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
  return {
    locale,
    t,
    merged,
    latestBusinessTurn,
    active,
    status,
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
  };
}

export function voiceOperationState(events: TableEvent[]) {
  const tools = new Map<string, TableEvent>();
  for (const event of events)
    if (event.kind === "voice.tool" && typeof event.data.toolCallId === "string")
      tools.set(event.data.toolCallId, event);
  const turns = new Map<string, TableEvent>();
  for (const event of events)
    if (event.kind === "voice.turn" && typeof event.data.turnId === "string")
      turns.set(event.data.turnId, event);
  const failedTurns = new Set(
    events.flatMap((event) => (event.kind === "voice.failed" ? [event.data.turnId] : [])),
  );
  for (const event of turns.values())
    if (event.data.status === "failed") failedTurns.add(event.data.turnId);
  const latestBusinessTurn =
    [...events]
      .toReversed()
      .find((event) => event.kind === "voice.turn" && event.data.status === "started")?.data
      .turnId ??
    [...events]
      .toReversed()
      .find((event) => event.kind === "voice.tool" || event.kind === "voice.failed")?.data.turnId;
  const running = [...tools.values()].filter((event) => {
    const turn = typeof event.data.turnId === "string" ? turns.get(event.data.turnId) : undefined;
    return (
      (event.data.state === "requested" || event.data.state === "running") &&
      !failedTurns.has(event.data.turnId) &&
      (!turn || turn.data.status === "started")
    );
  });
  return { tools, turns, failedTurns, latestBusinessTurn, running };
}

function conversationTimeline(merged: ConversationLine[], events: TableEvent[]) {
  const timeline: { createdAt: number; id: string; line?: ConversationLine; turnId?: string }[] =
    merged.map((line) => ({ id: line.id, createdAt: line.createdAt, line }));
  // 字幕の表示IDと業務turnを結び付けず、操作と商品カードを一か所に並べる。
  for (const turnId of new Set(
    events.flatMap((event) =>
      (event.kind === "voice.tool" || event.kind === "voice.products") &&
      typeof event.data.turnId === "string"
        ? [event.data.turnId]
        : [],
    ),
  )) {
    const first = events.find(
      (event) =>
        (event.kind === "voice.tool" || event.kind === "voice.products") &&
        event.data.turnId === turnId,
    );
    if (first)
      timeline.push({ id: `operation-${first.cursor}`, createdAt: first.createdAt, turnId });
  }
  timeline.sort((left, right) => left.createdAt - right.createdAt);
  return timeline;
}
