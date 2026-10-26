import type { TableEvent } from "@tablecast/api/schema";
import { CircleAlert, LoaderCircle, Mic, MicOff, Pause, Play, ShoppingBag } from "lucide-react";
import { lazy, Suspense } from "react";
import type { voiceOperationState } from "./conversation-model";
import type { VoiceView } from "./voice-connection";
import type { VoicePanelProps } from "./voice-panel";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { MicrophoneNotice, MicrophoneSettings } from "./microphone-settings";

const AudioWaveform = lazy(() =>
  import("./audio-waveform").then((module) => ({ default: module.AudioWaveform })),
);

export function VoiceAttention({
  snapshot,
  onReview,
  reviewPending,
  events,
  latestBusinessTurn,
  view,
}: Pick<VoicePanelProps, "onReview" | "reviewPending" | "snapshot" | "view"> & {
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

export function VoiceControls({
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
  | "controlDisabled"
  | "onMicrophoneChange"
  | "onMicrophoneRefresh"
  | "onSpeedChange"
  | "onStart"
  | "speechSpeed"
  | "view"
> & {
  active: boolean;
  phase: string;
  toolLabel?: string;
  visualState: "tool" | VoiceView["status"];
}) {
  return (
    <footer
      data-theme-part="voice-controls"
      className="mt-auto grid min-w-0 shrink-0 gap-2 border-t border-border pt-2"
    >
      {active && (
        <div className="min-w-0" data-ui="voice-media">
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
        </div>
      )}
      <div className="flex min-w-0 items-center justify-end gap-2">
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

function voiceControlLabel(status: VoiceView["status"], active: boolean, prominent: boolean) {
  if (status === "stopping") return "kiosk_voice_stopping";
  if (active) return "kiosk_voice_stop";
  if (prominent) return "kiosk_voice_start";
  return status === "error" ? "kiosk_voice_retry" : "kiosk_voice_resume";
}

export function VoiceToggle({
  view,
  onStart,
  controlDisabled,
  prominent = false,
}: Pick<VoicePanelProps, "controlDisabled" | "onStart" | "view"> & { prominent?: boolean }) {
  const { t } = useI18n();
  const active =
    view.error === "active" || !["idle", "paused", "error", "stopping"].includes(view.status);
  const label = t(voiceControlLabel(view.status, active, prominent));
  return (
    <span
      className={`pointer-events-auto relative inline-flex min-w-0 bg-(image:--voice-spectrum) p-0.5 shadow-control-dark ${prominent ? "mx-3 w-[calc(100%_-_1.5rem)] max-w-64 rounded-2xl" : "w-full rounded-xl"}`}
    >
      <Button
        className={`min-w-0 rounded-[inherit] text-center ${prominent ? "h-auto min-h-28 w-full gap-3 px-3 py-4" : "h-auto min-h-14 w-full whitespace-normal px-3 py-2 text-sm"}`}
        variant="voice"
        onClick={onStart}
        disabled={controlDisabled || view.status === "stopping"}
        aria-label={label}
      >
        {active ? (
          <MicOff className={prominent ? "size-10" : "size-4"} aria-hidden="true" />
        ) : (
          <VoiceStartIcon prominent={prominent} />
        )}
        {prominent ? (
          <VoiceStartCopy label={label} available={!active && view.status !== "stopping"} />
        ) : (
          label
        )}
      </Button>
    </span>
  );
}

function VoiceStartIcon({ prominent }: { prominent: boolean }) {
  return prominent ? (
    <Play className="size-10" fill="currentColor" aria-hidden="true" />
  ) : (
    <Mic className="size-4" aria-hidden="true" />
  );
}

function VoiceStartCopy({ available, label }: { available: boolean; label: string }) {
  const { t } = useI18n();
  return (
    <span className="min-w-0 flex-1 text-left">
      <strong className="block text-sm leading-snug">
        {available ? t("kiosk_voice_banner_title") : label}
      </strong>
      {available && (
        <span className="mt-1 block text-xs leading-relaxed opacity-90">
          {t("kiosk_voice_banner_description")}
        </span>
      )}
    </span>
  );
}
