import { Ear, LoaderCircle } from "lucide-react";
import type { StandbyStatus } from "./standby-model";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";

export type StandbyControlProps = {
  disabled?: boolean;
  onToggle: () => void;
  status: StandbyStatus;
};
export function StandbyControl({ status, onToggle, disabled }: StandbyControlProps) {
  const { t } = useI18n();
  const enabled = ["preparing", "armed", "connecting", "conversation"].includes(status);
  const labels = {
    off: "kiosk_standby_off",
    preparing: "kiosk_standby_preparing",
    armed: "kiosk_standby_armed",
    connecting: "kiosk_voice_connecting",
    conversation: "kiosk_standby_conversation",
    suspended: "kiosk_standby_suspended",
    error: "kiosk_standby_error",
    language: "kiosk_standby_language",
  } as const;
  return (
    <div className="grid gap-1">
      <Button
        variant="outline"
        className="h-auto min-h-11 w-full whitespace-normal px-3 py-2 text-xs"
        aria-pressed={enabled}
        onClick={onToggle}
        disabled={disabled}
      >
        {status === "preparing" ? (
          <LoaderCircle className="size-4 motion-safe:animate-spin" />
        ) : (
          <Ear className="size-4" />
        )}
        {t(enabled ? "kiosk_standby_disable" : "kiosk_standby_enable")}
      </Button>
      <p role="status" className="text-xs text-muted-foreground">
        {t(labels[status])}
      </p>
      {status === "off" && (
        <p className="text-xs text-muted-foreground">{t("kiosk_standby_note")}</p>
      )}
    </div>
  );
}
