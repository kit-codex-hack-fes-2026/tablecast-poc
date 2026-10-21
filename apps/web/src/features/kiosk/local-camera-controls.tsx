import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Camera, CameraOff, CircleAlert, LoaderCircle, SlidersHorizontal } from "lucide-react";
import type { useLocalCamera } from "./local-camera";
import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectItem } from "../../components/ui/select";
import { useI18n } from "../../i18n/locale";

export function LocalCameraStatus({
  camera,
  narrow,
}: {
  camera: ReturnType<typeof useLocalCamera>;
  narrow: boolean;
}) {
  const { t } = useI18n();
  const message = camera.error
    ? camera.error === "permission"
      ? "kiosk_camera_permission"
      : "kiosk_camera_unavailable"
    : camera.pending
      ? "common_loading"
      : "kiosk_camera_off";
  return (
    <div
      className={`absolute inset-x-0 top-0 flex items-center justify-center pr-7 pl-2 text-center ${narrow && camera.devices.length > 1 ? "bottom-24" : "bottom-12"}`}
    >
      <p
        role={camera.error ? "alert" : undefined}
        className={`wrap-anywhere text-xs leading-4 ${camera.error ? "text-destructive" : "text-muted-foreground"}`}
      >
        {t(message)}
      </p>
    </div>
  );
}

export function LocalCameraToggle({
  camera,
  compactStatus,
}: {
  camera: ReturnType<typeof useLocalCamera>;
  compactStatus: boolean;
}) {
  const { t } = useI18n();
  const enabled = Boolean(camera.stream || camera.pending);
  const label = t(enabled ? "kiosk_camera_stop" : "kiosk_camera_start");
  const compactError = compactStatus ? camera.error : undefined;
  const errorMessages = {
    permission: "kiosk_camera_permission",
    unavailable: "kiosk_camera_unavailable",
  } as const;
  const accessibleLabel = compactError ? `${label}: ${t(errorMessages[compactError])}` : label;
  return (
    <Button
      variant={compactError ? "destructive" : camera.stream ? "secondary" : "outline"}
      size="icon"
      className="size-11 min-h-11 shrink-0"
      aria-label={accessibleLabel}
      title={accessibleLabel}
      aria-pressed={Boolean(camera.stream)}
      onClick={() => (enabled ? camera.stop() : void camera.start())}
    >
      {camera.pending ? (
        <LoaderCircle className="motion-safe:animate-spin" />
      ) : compactError ? (
        <CircleAlert />
      ) : camera.stream ? (
        <CameraOff />
      ) : (
        <Camera />
      )}
    </Button>
  );
}

export function CameraDeviceSetting({ camera }: { camera: ReturnType<typeof useLocalCamera> }) {
  const { t } = useI18n();
  if (camera.devices.length < 2 || (!camera.stream && !camera.pending && !camera.error))
    return null;
  const options = camera.devices.map((device, index) => ({
    value: device.deviceId,
    label: device.label || `${t("kiosk_camera_device")} ${index + 1}`,
  }));
  return (
    <Select
      items={options}
      value={camera.deviceId}
      onValueChange={(value) => {
        if (value) void camera.start(value);
      }}
    >
      <SelectPrimitive.Trigger
        render={<Button variant="outline" size="icon" className="size-11 min-h-11 shrink-0" />}
        aria-label={t("kiosk_camera_device")}
        title={t("kiosk_camera_device")}
        aria-busy={camera.pending}
      >
        <SlidersHorizontal aria-hidden="true" />
      </SelectPrimitive.Trigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
