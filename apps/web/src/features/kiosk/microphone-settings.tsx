import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { CircleAlert, LoaderCircle, Mic, X } from "lucide-react";
import { useId } from "react";
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
}: {
  view: VoiceView;
  onChange: (deviceId: string) => void;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const labelId = useId();
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
  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) onRefresh();
      }}
    >
      <DialogPrimitive.Trigger
        render={<Button variant="outline" size="icon" className="size-11" />}
        aria-label={t("kiosk_microphone_settings")}
      >
        <Mic className="size-5" aria-hidden="true" />
      </DialogPrimitive.Trigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("kiosk_microphone_settings")}</DialogTitle>
          <DialogClose aria-label={t("common_close")}>
            <X aria-hidden="true" />
          </DialogClose>
        </DialogHeader>
        <DialogDescription>
          {paused ? t("kiosk_microphone_paused_description") : t("kiosk_microphone_description")}
        </DialogDescription>
        <div className="mt-5 space-y-3 overflow-y-auto">
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
