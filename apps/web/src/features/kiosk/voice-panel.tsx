import { Slider } from "@base-ui/react/slider";
import type { Catalog, Product, Snapshot, TableEvent } from "@tablecast/api/schema";
import { castInstructions } from "@tablecast/api/speech";
import {
  AudioLines,
  Bug,
  Check,
  CircleAlert,
  LoaderCircle,
  Mic,
  MicOff,
  Rabbit,
  ShoppingBag,
  Turtle,
} from "lucide-react";
import { lazy, Suspense, useState, type ReactNode } from "react";
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
import { ProductMenu } from "./menu";
import type { VoiceView } from "./voice-connection";

const AudioWaveform = lazy(() =>
  import("./audio-waveform").then((module) => ({ default: module.AudioWaveform })),
);

const speakerColours = [
  "bg-sky-100 text-sky-900",
  "bg-violet-100 text-violet-900",
  "bg-amber-100 text-amber-900",
  "bg-teal-100 text-teal-900",
];
function speakerColour(line: ConversationLine) {
  if (!line.speaker) return "bg-secondary text-secondary-foreground";
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

function ConversationMessage({
  line,
  status,
  debug,
  children,
}: {
  line: ConversationLine;
  status?: string;
  debug: boolean;
  children?: ReactNode;
}) {
  const { locale, t } = useI18n();
  return (
    <article
      data-role={line.role}
      data-live={Boolean(status)}
      className="group min-w-0 max-w-full w-fit data-[role=user]:ml-auto"
      lang={line.locale}
    >
      <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span
          className={`inline-flex items-center gap-2 rounded-md px-2 py-0.5 font-semibold ${line.role === "user" ? speakerColour(line) : "bg-primary/10 text-primary"}`}
        >
          {line.role === "assistant" ? (
            <AudioLines className="size-3.5" aria-hidden="true" />
          ) : (
            <Mic className="size-3.5" aria-hidden="true" />
          )}
          {line.role === "assistant"
            ? t("kiosk_assistant")
            : line.speaker
              ? `${t("kiosk_speaker")} ${line.streamId && line.speaker.startsWith(`${line.streamId}:`) ? line.speaker.slice(line.streamId.length + 1) : line.speaker}`
              : t("kiosk_guest")}
        </span>
        <span>{status || time(line.createdAt, locale)}</span>
      </div>
      <div className="rounded-xl border border-border bg-card px-3 py-2 text-sm leading-relaxed text-foreground shadow-xs shadow-black/5 group-data-[role=user]:bg-secondary group-data-[live=true]:border-primary group-data-[live=true]:ring-1 group-data-[live=true]:ring-primary/20">
        {line.text ? (
          <Streamdown
            mode={status ? "streaming" : "static"}
            isAnimating={Boolean(status)}
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
        <p className="mt-1 text-xs text-muted-foreground">
          {locale === "ja"
            ? "表示を同期中。発話が終わると更新されます。"
            : "Syncing the transcript. It will update after playback."}
        </p>
      )}
      {line.synthetic && (
        <p className="mt-1 text-xs text-muted-foreground">{t("common_synthetic")}</p>
      )}
      {debug && line.rawText && (
        <details className="mt-2 rounded-lg border border-dashed border-border p-3 text-xs">
          <summary className="cursor-pointer">
            {locale === "ja" ? "発話タグ・生成原文" : "Speech tags and generated text"}
          </summary>
          <pre className="mt-2 whitespace-pre-wrap wrap-break-word font-mono">{line.rawText}</pre>
        </details>
      )}
      {debug && line.role === "user" && !line.speaker && (
        <p className="mt-1 text-xs">
          {locale === "ja" ? "話者情報なし（推定しません）" : "Speaker metadata unavailable"}
        </p>
      )}
      {debug && line.streamId && (
        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
          STT {line.streamId}
        </p>
      )}
    </article>
  );
}

const toolLabels: Record<string, [string, string]> = {
  getCatalog: ["おしながきを確認", "Checking the menu"],
  getTableState: ["注文・画面を確認", "Checking your order and screen"],
  updateCart: ["注文かごを更新", "Updating your basket"],
  prepareConfirmation: ["注文内容を確認", "Preparing order confirmation"],
  submitOrder: ["注文を送信", "Sending your order"],
  callStaff: ["店員を呼ぶ", "Calling staff"],
  showProducts: ["商品を表示", "Showing dishes and drinks"],
  setLanguage: ["言語を変更", "Changing language"],
  setSpeechSpeed: ["話速を変更", "Changing speech speed"],
  setUiSection: ["注文画面を切り替え", "Changing the order view"],
};

function useVoicePanel({
  view,
  lines,
  events = [],
  catalog,
  onChoose,
}: {
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
}) {
  const { locale, t } = useI18n();
  const [debug, setDebug] = useState(false);
  const merged = mergeConversation(lines, view, locale);
  const tools = new Map<string, TableEvent>();
  for (const event of events)
    if (event.kind === "voice.tool" && typeof event.data.toolCallId === "string")
      tools.set(event.data.toolCallId, event);
  const failedTurns = new Set(
    events.flatMap((event) => (event.kind === "voice.failed" ? [event.data.turnId] : [])),
  );
  const latestUserTurn = [...events].toReversed().find((event) => event.kind === "voice.user")
    ?.data.turnId;
  const running = [...tools.values()].filter(
    (event) =>
      event.data.state === "running" &&
      !failedTurns.has(event.data.turnId) &&
      (!latestUserTurn || event.data.turnId === latestUserTurn),
  );
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
  const toolPhase = locale === "ja" ? "ツール実行中" : "Using tools";
  const phase = visualState === "tool" ? toolPhase : status;
  const assistantTurns = new Set(
    merged.flatMap((line) => (line.role === "assistant" ? [line.turnId] : [])),
  );
  function toolCards(turnId?: string) {
    return [...tools.values()].flatMap((event) => {
      if (event.data.turnId !== turnId) return [];
      const failed = event.data.state === "error";
      const pending = event.data.state === "running";
      const stale =
        pending &&
        (!active ||
          failedTurns.has(turnId) ||
          Boolean(latestUserTurn && turnId !== latestUserTurn));
      const name = typeof event.data.toolName === "string" ? event.data.toolName : "";
      const title =
        toolLabels[name]?.[locale === "ja" ? 0 : 1] ?? (locale === "ja" ? "処理" : "Action");
      return [
        <div
          key={String(event.data.toolCallId)}
          className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-xs"
          data-tool-state={stale ? "interrupted" : String(event.data.state)}
        >
          {failed ? (
            <CircleAlert className="size-4 text-destructive" />
          ) : pending && !stale ? (
            <LoaderCircle className="size-4 motion-safe:animate-spin text-primary" />
          ) : stale ? (
            <MicOff className="size-4" />
          ) : (
            <Check className="size-4 text-success" />
          )}
          <span className="flex-1">
            {title}
            {failed && (
              <span className="mt-1 block text-destructive">
                {locale === "ja"
                  ? "処理を完了できませんでした。画面から再度操作できます。"
                  : "This action could not be completed. You can try it again on screen."}
              </span>
            )}
          </span>
          <span className="text-muted-foreground">
            {failed
              ? locale === "ja"
                ? "エラー"
                : "Failed"
              : stale
                ? locale === "ja"
                  ? "中断"
                  : "Interrupted"
                : pending
                  ? locale === "ja"
                    ? "実行中"
                    : "Running"
                  : locale === "ja"
                    ? "完了"
                    : "Complete"}
          </span>
          {debug && (
            <code>
              {name}
              {typeof event.data.errorCode === "string" ? ` · ${event.data.errorCode}` : ""}
            </code>
          )}
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
  const timeline: { id: string; createdAt: number; line?: ConversationLine; turnId?: string }[] =
    merged.map((line) => ({ id: line.id, createdAt: line.createdAt, line }));
  for (const turnId of new Set(
    [...tools.values()].map((event) =>
      typeof event.data.turnId === "string" ? event.data.turnId : undefined,
    ),
  )) {
    if (merged.some((line) => line.turnId === turnId)) continue;
    const first = events.find(
      (event) => event.kind === "voice.tool" && event.data.turnId === turnId,
    );
    if (first) timeline.push({ id: `tool-${first.cursor}`, createdAt: first.createdAt, turnId });
  }
  timeline.toSorted((left, right) => left.createdAt - right.createdAt);
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
    debug,
    setDebug,
    merged,
    latestUserTurn,
    active,
    status,
    usingTools,
    visualState,
    toolPhase,
    phase,
    assistantTurns,
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
}: {
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
}) {
  const {
    locale,
    t,
    debug,
    setDebug,
    merged,
    latestUserTurn,
    active,
    usingTools,
    visualState,
    toolPhase,
    phase,
    assistantTurns,
    toolCards,
    products,
    timeline,
    liveRole,
    speakingLine,
    hasLive,
  } = useVoicePanel({
    view,
    lines,
    onStart,
    events,
    catalog,
    onChoose,
    snapshot,
    onReview,
    reviewPending,
    controlDisabled,
    speechSpeed,
    onSpeedChange,
  });
  return (
    <section
      className="relative flex h-full min-h-0 min-w-0 flex-col px-3"
      aria-label={t("kiosk_conversation")}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border py-1">
        <h2 className="text-sm font-semibold">{t("kiosk_conversation")}</h2>
        <output
          className="ml-auto flex items-center gap-2 text-xs font-medium text-foreground"
          aria-live="polite"
        >
          <span
            className={`size-2 rounded-full ${active ? "bg-success motion-safe:animate-pulse" : "bg-muted-foreground"}`}
          />
          {phase}
        </output>
        <Button
          variant="ghost"
          size="icon"
          aria-label={locale === "ja" ? "デバッグ表示" : "Show debug details"}
          aria-pressed={debug}
          onClick={() => setDebug(!debug)}
        >
          <Bug className="size-4" />
        </Button>
      </header>
      {debug && (
        <details className="border-b border-dashed border-border py-3 text-xs">
          <summary className="cursor-pointer">
            {locale === "ja" ? "接客・感情プロンプト" : "Cast and emotion prompt"}
          </summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap">
            {castInstructions}
            {"\n\n"}
            {catalog?.configuration.cast.instructions[locale] ||
              (locale === "ja" ? "店舗設定を読み込み中" : "Loading cast settings")}
          </pre>
        </details>
      )}
      <Conversation>
        <ConversationContent>
          {merged.length === 0 && !active && (
            <div className="flex flex-col items-start gap-3 py-5">
              <AudioLines className="size-10 text-muted-foreground" strokeWidth={1.2} />
              <h1 className="whitespace-pre-line font-serif text-xl leading-relaxed">
                {t("kiosk_welcome")}
              </h1>
            </div>
          )}
          {timeline.map((entry) => {
            const line = entry.line;
            return line ? (
              <div className="space-y-2" key={line.id}>
                {line.role === "assistant" && (
                  <div className="w-11/12 space-y-2">{toolCards(line.turnId)}</div>
                )}
                <ConversationMessage
                  line={line}
                  debug={debug}
                  status={
                    line === speakingLine
                      ? t("kiosk_voice_speaking")
                      : line.live
                        ? line.role === "user"
                          ? t("kiosk_transcribing")
                          : locale === "ja"
                            ? "返答を生成中"
                            : "Generating reply"
                        : undefined
                  }
                >
                  {line.role === "assistant" && products(line.turnId)}
                </ConversationMessage>
                {line.role === "user" && !assistantTurns.has(line.turnId) && (
                  <div className="w-11/12 space-y-2">
                    {toolCards(line.turnId)}
                    {products(line.turnId)}
                  </div>
                )}
              </div>
            ) : (
              <div key={entry.id} className="w-11/12 space-y-2">
                {toolCards(entry.turnId)}
                {products(entry.turnId)}
              </div>
            );
          })}
          {active && !hasLive && (
            <ConversationMessage
              debug={false}
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
          )}
          {snapshot && ["pending", "read"].includes(snapshot.status) && onReview && (
            <div className="w-11/12 rounded-xl border border-primary/30 bg-card p-4">
              <div className="mb-3 flex items-center gap-2 font-medium">
                <ShoppingBag className="size-4" />
                {t("kiosk_review")}
              </div>
              <p className="whitespace-pre-wrap text-sm">{snapshot.text}</p>
              <Button className="mt-4 w-full" onClick={onReview} disabled={reviewPending}>
                {t("kiosk_review")}
              </Button>
            </div>
          )}
          {events
            .filter(
              (event) =>
                event.kind === "voice.failed" &&
                event.data.turnId === latestUserTurn &&
                !merged.some((line) => line.role === "user" && line.createdAt > event.createdAt),
            )
            .slice(-1)
            .map((event) => (
              <output
                key={event.cursor}
                className="flex gap-2 rounded-lg border border-destructive/40 bg-card p-3 text-sm text-destructive"
              >
                <CircleAlert className="size-4 shrink-0" />
                {locale === "ja"
                  ? "音声の返答が途切れました。注文結果は注文かご・履歴で確認できます。"
                  : "The voice reply was interrupted. Check your basket and order history for the result."}
                {debug && typeof event.data.code === "string" && <code>{event.data.code}</code>}
              </output>
            ))}
        </ConversationContent>
        <ConversationScrollButton
          label={t("kiosk_latest")}
          followLabel={locale === "ja" ? "自動追従中" : "Following"}
        />
      </Conversation>
      {view.status === "error" && (
        <output className="rounded-lg bg-destructive/5 p-3 text-sm">
          <MicOff className="mr-2 inline size-4" />
          {view.error === "active"
            ? t("kiosk_voice_already_active")
            : view.error === "permission"
              ? t("kiosk_voice_permission")
              : view.error === "unconfigured"
                ? t("kiosk_voice_setup")
                : t("kiosk_voice_error")}
          <p className="mt-1 text-xs text-muted-foreground">{t("kiosk_voice_fallback")}</p>
        </output>
      )}
      <footer className="shrink-0 border-t border-white/80 bg-white/65 px-1 pb-2 pt-1 backdrop-blur-xl">
        <Suspense fallback={null}>
          <AudioWaveform
            state={visualState}
            toolLabel={usingTools && view.status === "speaking" ? toolPhase : undefined}
            track={
              active ? (view.status === "speaking" ? view.outputTrack : view.inputTrack) : undefined
            }
            label={phase}
          />
        </Suspense>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex rounded-xl bg-voice-spectrum p-0.5 shadow-md shadow-violet-500/15">
            <Button
              className="h-11 rounded-[inherit]"
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
          {onSpeedChange && (
            <Slider.Root
              className="flex min-w-32 flex-1 items-center gap-2"
              key={speechSpeed}
              defaultValue={speechSpeed}
              min={0.5}
              max={1.5}
              step={0.1}
              onValueCommitted={(value) => {
                if (typeof value === "number") onSpeedChange(value);
              }}
            >
              <Turtle className="size-5 shrink-0" aria-hidden="true" />
              <Slider.Control className="flex h-11 flex-1 touch-none items-center">
                <Slider.Track className="relative h-1.5 w-full rounded-full bg-border">
                  <Slider.Indicator className="rounded-full bg-primary" />
                  <Slider.Thumb
                    aria-label={locale === "ja" ? "話す速さ" : "Speech speed"}
                    className="size-5 rounded-full border-2 border-primary bg-card shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  />
                </Slider.Track>
              </Slider.Control>
              <Rabbit className="size-5 shrink-0" aria-hidden="true" />
              <Slider.Value className="min-w-10 text-xs tabular-nums">
                {(value) => `${Number(value).toFixed(1)}×`}
              </Slider.Value>
            </Slider.Root>
          )}
        </div>
        {debug && <p className="mt-2 text-xs">{t("kiosk_voice_privacy")}</p>}
      </footer>
    </section>
  );
}
