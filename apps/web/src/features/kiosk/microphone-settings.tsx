import { Slider } from "@base-ui/react/slider";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { CircleAlert, LoaderCircle, SlidersHorizontal, Turtle, Rabbit, X } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { useI18n } from "../../i18n/locale";
import { initialMicrophone, type MicrophoneError, type VoiceView } from "./voice-model";

const errors = {
  permission: "kiosk_microphone_error_permission",
  empty: "kiosk_microphone_error_empty",
  disconnected: "kiosk_microphone_error_disconnected",
  failed: "kiosk_microphone_error_failed",
  unsupported: "kiosk_microphone_error_unsupported",
} as const satisfies Record<MicrophoneError, string>;

export function MicrophoneNotice({ error }: { error?: MicrophoneError }) {
  const { t } = useI18n();
  return error ? (
    <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {t(errors[error])}
    </p>
  ) : null;
}

export function MicrophoneSettings({
  view,
  onChange,
  onRefresh,
  speechSpeed = 1,
  onSpeedChange,
}: {
  view: VoiceView;
  onChange: (deviceId: string) => void;
  onRefresh: () => void;
  speechSpeed?: number;
  onSpeedChange?: (value: number) => void;
}) {
  const { t } = useI18n();
  const labelId = useId();
  const settingsLabel = t("kiosk_input_settings");
  const { microphone, paused, busy, selectedMissing, statusMessage, options } =
    useMicrophoneOptions(view);
  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) onRefresh();
      }}
    >
      <DialogPrimitive.Trigger
        render={<Button variant="outline" size="icon" className="size-11 min-h-11" />}
        aria-label={settingsLabel}
      >
        <SlidersHorizontal className="size-5" aria-hidden="true" />
      </DialogPrimitive.Trigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{settingsLabel}</DialogTitle>
          <DialogClose aria-label={t("common_close")}>
            <X aria-hidden="true" />
          </DialogClose>
        </DialogHeader>
        <DialogDescription>
          {paused ? t("kiosk_microphone_paused_description") : t("kiosk_microphone_description")}
        </DialogDescription>
        <div className="mt-5 space-y-4 overflow-y-auto">
          {onSpeedChange && <SpeechSpeedSetting value={speechSpeed} onChange={onSpeedChange} />}
          <p id={labelId} className="text-sm font-medium">
            {t("kiosk_microphone_input")}
          </p>
          <Select
            items={options}
            value={microphone.selectedId}
            onValueChange={(value) => {
              if (value) onChange(value);
            }}
            disabled={busy}
          >
            <SelectTrigger aria-labelledby={labelId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-w-[calc(100vw-3rem)]">
              {options.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  disabled={selectedMissing && option.value === microphone.selectedId}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p role="status" className="text-sm text-muted-foreground">
            {statusMessage}
          </p>
          {microphone.permissionRequired && (
            <p className="text-sm text-muted-foreground">{t("kiosk_microphone_permission_hint")}</p>
          )}
          {microphone.limited && (
            <p className="text-sm text-muted-foreground">{t("kiosk_microphone_limited_hint")}</p>
          )}
          <MicrophoneNotice error={microphone.error} />
          <Button
            variant="outline"
            onClick={onRefresh}
            disabled={microphone.loading || busy}
            className="w-full"
          >
            {microphone.loading && (
              <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" />
            )}
            {microphone.loading ? t("kiosk_microphone_loading") : t("kiosk_microphone_refresh")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SpeechSpeedSetting({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const { t } = useI18n();
  const labelId = useId();
  const [draft, setDraft] = useState({ value, source: value });
  if (draft.source !== value) setDraft({ value, source: value });
  return (
    <div className="space-y-2">
      <p id={labelId} className="text-sm font-medium">
        {t("kiosk_speech_speed")}
      </p>
      <Slider.Root
        className="flex items-center gap-3"
        value={draft.value}
        onValueChange={(next) => {
          if (typeof next === "number") setDraft((current) => ({ ...current, value: next }));
        }}
        min={0.5}
        max={1.5}
        step={0.1}
        onValueCommitted={(next) => {
          if (typeof next === "number") onChange(next);
        }}
      >
        <Turtle className="size-5 shrink-0" aria-hidden="true" />
        <Slider.Control className="flex h-11 flex-1 touch-none items-center">
          <Slider.Track className="relative h-1.5 w-full rounded-full bg-border">
            <Slider.Indicator className="rounded-full bg-primary" />
            <Slider.Thumb
              aria-labelledby={labelId}
              className="size-5 rounded-full border-2 border-primary bg-card shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            />
          </Slider.Track>
        </Slider.Control>
        <Rabbit className="size-5 shrink-0" aria-hidden="true" />
        <Slider.Value className="min-w-10 text-xs tabular-nums">
          {(current) => `${Number(current).toFixed(1)}×`}
        </Slider.Value>
      </Slider.Root>
    </div>
  );
}

function useMicrophoneOptions(view: VoiceView) {
  const { t } = useI18n();
  const microphone = view.microphone ?? initialMicrophone;
  const paused = ["idle", "paused", "stopping", "error"].includes(view.status);
  const busy = microphone.switching || view.status === "connecting" || view.status === "stopping";
  const selectedMissing =
    microphone.selectedId !== "default" &&
    !microphone.devices.some((device) => device.deviceId === microphone.selectedId);
  let statusMessage: string | null = null;
  if (microphone.switching) {
    statusMessage = t("kiosk_microphone_switching");
  } else if (microphone.activeLabel) {
    statusMessage = `${t("kiosk_microphone_in_use")}: ${microphone.activeLabel}`;
  } else if (paused) {
    statusMessage = t("kiosk_microphone_paused");
  }
  const options = [
    { value: "default", label: t("kiosk_microphone_default") },
    ...microphone.devices.flatMap((device, index) =>
      device.deviceId === "default"
        ? []
        : [
            {
              value: device.deviceId,
              label: device.label || `${t("kiosk_microphone_name")} ${index + 1}`,
            },
          ],
    ),
    ...(selectedMissing
      ? [
          {
            value: microphone.selectedId,
            label: t("kiosk_microphone_unavailable"),
          },
        ]
      : []),
  ];
  return { microphone, paused, busy, selectedMissing, statusMessage, options };
}
