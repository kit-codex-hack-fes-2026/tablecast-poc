import { tv, type VariantProps } from "tailwind-variants";
import type { Catalog, Product, Snapshot, TableEvent } from "@tablecast/api/schema";
import {
  AudioLines,
  Check,
  CircleAlert,
  LoaderCircle,
  Mic,
  MicOff,
  Pause,
  ShoppingBag,
} from "lucide-react";
import { forwardRef, lazy, Suspense, useRef, type ReactNode } from "react";
import { AnimatePresence, useIsPresent, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { Streamdown } from "streamdown";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "../../components/ai-elements/conversation";
import { Button } from "../../components/ui/button";
import { time } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { mergeConversation, type ConversationLine } from "./conversation-model";
import { ProductMenu } from "../../components/product-menu";
import { MicrophoneNotice, MicrophoneSettings } from "./microphone-settings";
import { LocalCamera, useLocalCamera } from "./local-camera";
import type { VoiceView } from "./voice-connection";

const AudioWaveform = lazy(() =>
  import("./audio-waveform").then((module) => ({ default: module.AudioWaveform })),
);

const speakerBadge = tv({
  base: "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-2 py-0.5 font-semibold",
  variants: {
    colour: {
      assistant: "bg-primary/10 text-primary",
      guest: "bg-secondary text-secondary-foreground",
      sky: "bg-nav-workspace-soft text-nav-workspace",
      violet: "bg-nav-menu-soft text-nav-menu",
      amber: "bg-warning-soft text-warning",
      teal: "bg-nav-store-soft text-nav-store",
    },
  },
});
const speakerColours = ["sky", "violet", "amber", "teal"] as const;
function speakerColour(line: ConversationLine): VariantProps<typeof speakerBadge>["colour"] {
  if (line.role === "assistant") return "assistant";
  if (!line.speaker) return "guest";
  const hash = Array.from(`${line.streamId ?? ""}:${line.speaker}`).reduce(
    (sum, letter) => (sum * 31 + letter.charCodeAt(0)) | 0,
    0,
  );
  return speakerColours[Math.abs(hash) % speakerColours.length];
}

const markdownComponents = {
  a: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  img: () => null,
};

const transcriptAnimation = {
  animation: "fadeIn",
  duration: 150,
  sep: "char",
  stagger: 0,
  maxBacklogMs: 0,
} as const;

// 行のIDと本文DOMを保ち、追加された発話だけを短く表示する。
const ConversationEntry = forwardRef<HTMLDivElement, { children: ReactNode; className?: string }>(
  function ConversationEntry({ children, className }, ref) {
    const present = useIsPresent();
    const reduced = useReducedMotion();
    return (
      <m.div
        ref={ref}
        data-ui="conversation-entry"
        className={className}
        inert={!present}
        aria-hidden={!present || undefined}
        initial={reduced ? false : { opacity: 0, transform: "translateY(6px)" }}
        animate={{ opacity: 1, transform: "none" }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduced ? 0 : 0.2, ease: [0.23, 1, 0.32, 1] }}
      >
        {children}
      </m.div>
    );
  },
);

function ConversationMessage({
  line,
  status,
  children,
}: {
  line: ConversationLine;
  status?: string;
  children?: ReactNode;
}) {
  const { locale, t } = useI18n();
  const reduced = useReducedMotion();
  return (
    <article
      data-role={line.role}
      data-live={Boolean(status)}
      className="group min-w-0 max-w-full w-fit data-[role=user]:ml-auto"
      lang={line.locale}
    >
      <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className={speakerBadge({ colour: speakerColour(line) })}>
          {line.role === "assistant" ? (
            <AudioLines className="size-3.5" aria-hidden="true" />
          ) : (
            <Mic className="size-3.5" aria-hidden="true" />
          )}
          {conversationSpeakerName(line, t)}
        </span>
        <span className="text-right tabular-nums">{status || time(line.createdAt, locale)}</span>
      </div>
      <div className="rounded-xl border border-border bg-card px-3 py-2 text-sm leading-relaxed text-foreground shadow-xs group-data-[role=user]:bg-secondary group-data-[live=true]:border-primary group-data-[live=true]:ring-1 group-data-[live=true]:ring-primary/20">
        {line.text ? (
          <Streamdown
            mode={status ? "streaming" : "static"}
            isAnimating={Boolean(status)}
            animated={status && !reduced ? transcriptAnimation : false}
            controls={false}
            components={markdownComponents}
          >
            {line.text}
          </Streamdown>
        ) : (
          <span className="flex items-center gap-3 text-muted-foreground">
            <span className="flex gap-1" aria-hidden="true">
              {[0, 1, 2].map((index) => (
                <span
                  key={index}
                  className="size-1.5 rounded-full bg-current motion-safe:animate-pulse"
                  style={{ animationDelay: `${index * 200}ms` }}
                />
              ))}
            </span>
            {status}
          </span>
        )}
        {children}
      </div>
      {line.interrupted && (
        <p className="mt-1 text-xs text-muted-foreground">{t("kiosk_interrupted")}</p>
      )}
      {line.displayIncomplete && (
        <p className="mt-1 text-xs text-muted-foreground">{t("kiosk_transcript_syncing")}</p>
      )}
      {line.synthetic && (
        <p className="mt-1 text-xs text-muted-foreground">{t("common_synthetic")}</p>
      )}
    </article>
  );
}

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

type VoicePanelProps = {
  view: VoiceView;
  lines: ConversationLine[];
  onStart: () => void;
  events?: TableEvent[];
  catalog?: Catalog;
  onChoose?: (product: Product) => void;
  snapshot?: Snapshot | null;
  onReview?: () => void;
  reviewPending?: boolean;
  controlDisabled?: boolean;
  speechSpeed?: number;
  onSpeedChange?: (value: number) => void;
  onMicrophoneChange?: (deviceId: string) => void;
  onMicrophoneRefresh?: () => void;
};

function useVoicePanel({
  view,
  lines,
  events = [],
  catalog,
  onChoose,
}: Pick<VoicePanelProps, "view" | "lines" | "events" | "catalog" | "onChoose">) {
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
  const visualState: VoiceView["status"] | "tool" =
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
export function VoicePanel({
  view,
  lines,
  onStart,
  events = [],
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

function VoiceAttention({
  snapshot,
  onReview,
  reviewPending,
  events,
  latestBusinessTurn,
  view,
}: Pick<VoicePanelProps, "snapshot" | "onReview" | "reviewPending" | "view"> & {
  events: TableEvent[];
  latestBusinessTurn: ReturnType<typeof voiceOperationState>["latestBusinessTurn"];
}) {
  const { t } = useI18n();
  const voiceError = {
    active: "kiosk_voice_already_active",
    permission: "kiosk_voice_permission",
    unconfigured: "kiosk_voice_setup",
    connection: "kiosk_voice_error",
  } as const;
  const errorLabel = view.error ? voiceError[view.error] : "kiosk_voice_error";
  return (
    <div className="shrink-0 space-y-3 empty:hidden">
      {snapshot && ["pending", "read"].includes(snapshot.status) && onReview && (
        <div className="rounded-xl bg-card p-3 shadow-surface">
          <div className="mb-3 flex items-center gap-2 font-medium">
            <ShoppingBag className="size-4" />
            {t("kiosk_review")}
          </div>
          <p className="whitespace-pre-wrap text-sm">{snapshot.text}</p>
          <Button
            className="mt-4 h-auto min-h-14 w-full whitespace-normal py-2"
            onClick={onReview}
            disabled={reviewPending}
          >
            {t("kiosk_review")}
          </Button>
        </div>
      )}
      {events
        .filter(
          (event) => event.kind === "voice.failed" && event.data.turnId === latestBusinessTurn,
        )
        .slice(-1)
        .map((event) => (
          <output
            key={event.cursor}
            className="flex gap-2 rounded-lg border border-destructive/40 bg-card p-3 text-sm text-destructive"
          >
            <CircleAlert className="size-4 shrink-0" />
            {t("kiosk_reply_interrupted")}
          </output>
        ))}
      {view.status === "error" && (
        <output className="rounded-lg bg-destructive/5 p-3 text-sm">
          <MicOff className="mr-2 inline size-4" />
          {t(errorLabel)}
          <p className="mt-1 text-xs text-muted-foreground">{t("kiosk_voice_fallback")}</p>
        </output>
      )}
      <MicrophoneNotice error={view.microphone?.error} />
    </div>
  );
}

function VoiceIdle({
  label,
  state,
  toolLabel,
}: {
  label: string;
  state: string;
  toolLabel?: string;
}) {
  const pending = !["idle", "paused", "stopping", "error"].includes(state);
  const Icon = pending
    ? LoaderCircle
    : state === "error"
      ? CircleAlert
      : state === "stopping"
        ? MicOff
        : Pause;
  return (
    <figure
      className="flex w-full max-w-96 shrink-0 items-center gap-2 text-foreground"
      data-voice-state={state}
      data-motion="still"
    >
      <div
        aria-hidden="true"
        className="flex size-12 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-card via-control to-card shadow-sm ring-1 ring-border"
      >
        <Icon
          className={
            state === "error"
              ? "size-4 text-destructive"
              : pending
                ? "size-4 motion-safe:animate-spin"
                : "size-4"
          }
        />
      </div>
      <div className="min-w-0 flex-1">
        <figcaption
          className={
            state === "error" ? "text-xs font-medium text-destructive" : "text-xs font-medium"
          }
          data-ui="voice-status"
        >
          {label}
          {toolLabel && toolLabel !== label && <span className="font-normal">{toolLabel}</span>}
        </figcaption>
        <div className="flex h-4 items-center" aria-hidden="true">
          <span className="h-px w-full bg-border" />
        </div>
      </div>
    </figure>
  );
}

function voiceOperationState(events: TableEvent[]) {
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
  const timeline: { id: string; createdAt: number; line?: ConversationLine; turnId?: string }[] =
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

function VoiceControls({
  view,
  active,
  phase,
  visualState,
  toolLabel,
  onStart,
  controlDisabled,
  speechSpeed,
  onSpeedChange,
  onMicrophoneChange,
  onMicrophoneRefresh,
}: Pick<
  VoicePanelProps,
  | "view"
  | "onStart"
  | "controlDisabled"
  | "speechSpeed"
  | "onSpeedChange"
  | "onMicrophoneChange"
  | "onMicrophoneRefresh"
> & {
  active: boolean;
  phase: string;
  visualState: VoiceView["status"] | "tool";
  toolLabel?: string;
}) {
  return (
    <footer
      data-theme-part="voice-controls"
      className="grid min-w-0 shrink-0 gap-2 border-t border-border pt-2"
    >
      <div className="min-w-0" data-ui="voice-media">
        {active ? (
          <Suspense
            fallback={<VoiceIdle label={phase} state={visualState} toolLabel={toolLabel} />}
          >
            <AudioWaveform
              compact
              state={visualState}
              toolLabel={toolLabel}
              track={view.status === "speaking" ? view.outputTrack : view.inputTrack}
              label={phase}
            />
          </Suspense>
        ) : (
          <VoiceIdle label={phase} state={visualState} />
        )}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <VoiceToggle view={view} onStart={onStart} controlDisabled={controlDisabled} />
        {onMicrophoneChange && onMicrophoneRefresh && (
          <MicrophoneSettings
            view={view}
            speechSpeed={speechSpeed}
            onSpeedChange={onSpeedChange}
            onChange={onMicrophoneChange}
            onRefresh={onMicrophoneRefresh}
          />
        )}
      </div>
    </footer>
  );
}

function VoiceToggle({
  view,
  onStart,
  controlDisabled,
}: Pick<VoicePanelProps, "view" | "onStart" | "controlDisabled">) {
  const { t } = useI18n();
  const active =
    view.error === "active" || !["idle", "paused", "error", "stopping"].includes(view.status);
  return (
    <span className="inline-flex w-full min-w-0 rounded-xl bg-(image:--voice-spectrum) p-0.5 shadow-control-dark">
      <Button
        className="h-auto min-h-14 w-full min-w-0 whitespace-normal rounded-[inherit] px-3 py-2 text-center text-sm"
        variant="voice"
        onClick={onStart}
        disabled={controlDisabled}
      >
        {active ? <MicOff /> : <Mic />}
        {view.status === "stopping"
          ? t("kiosk_voice_stopping")
          : active
            ? t("kiosk_voice_stop")
            : view.status === "error"
              ? t("kiosk_voice_retry")
              : t("kiosk_voice_resume")}
      </Button>
    </span>
  );
}

function conversationSpeakerName(line: ConversationLine, t: ReturnType<typeof useI18n>["t"]) {
  if (line.role === "assistant") return t("kiosk_assistant");
  if (!line.speaker) return t("kiosk_guest");
  const speaker =
    line.streamId && line.speaker.startsWith(`${line.streamId}:`)
      ? line.speaker.slice(line.streamId.length + 1)
      : line.speaker;
  return `${t("kiosk_speaker")} ${speaker}`;
}
