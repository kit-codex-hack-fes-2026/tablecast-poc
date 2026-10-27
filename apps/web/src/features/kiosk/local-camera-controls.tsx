import { Select as SelectPrimitive } from "@base-ui/react/select";
import {
  Camera,
  CameraOff,
  CircleAlert,
  LoaderCircle,
  SlidersHorizontal,
  SwitchCamera,
} from "lucide-react";
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import type { useLocalCamera } from "./local-camera";
import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectItem } from "../../components/ui/select";
import { useI18n } from "../../i18n/locale";

function LocalCameraStatus({ camera }: { camera: ReturnType<typeof useLocalCamera> }) {
  const { t } = useI18n();
  const message = camera.error
    ? camera.error === "permission"
      ? "kiosk_camera_permission"
      : "kiosk_camera_unavailable"
    : camera.pending
      ? "common_loading"
      : "kiosk_camera_off";
  return (
    <div className="absolute inset-y-1 right-1 left-13 flex items-start pt-1 text-left">
      <p
        role={camera.error ? "alert" : undefined}
        className={`wrap-anywhere text-xs leading-4 ${camera.error ? "text-destructive" : "text-muted-foreground"}`}
      >
        {t(message)}
      </p>
    </div>
  );
}

function LocalCameraToggle({
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
      className={cameraControl}
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

function CameraDeviceSetting({ camera }: { camera: ReturnType<typeof useLocalCamera> }) {
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
        render={<Button variant="outline" size="icon" className={cameraControl} />}
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

function CameraFacingToggle({ camera }: { camera: ReturnType<typeof useLocalCamera> }) {
  const { t } = useI18n();
  if (!camera.stream || !camera.canFlip) return null;
  const label = t(camera.facing === "user" ? "kiosk_camera_use_back" : "kiosk_camera_use_front");
  return (
    <Button
      variant="outline"
      size="icon"
      className={cameraControl}
      aria-label={label}
      title={label}
      disabled={camera.pending}
      onClick={() => {
        void camera.flip();
      }}
    >
      <SwitchCamera aria-hidden="true" />
    </Button>
  );
}

// 小さい縦枠では既存のデバイス選択を使い、操作同士を重ねない。
export function LocalCameraOverlay({
  camera,
  width,
  aspectRatio,
}: {
  aspectRatio: number;
  camera: ReturnType<typeof useLocalCamera>;
  width: number;
}) {
  const narrow = width < 100;
  const showFlip = camera.canFlip && width >= 96;
  const compactStatus = width / aspectRatio < 80 || narrow || camera.devices.length > 1;
  return (
    <>
      <LocalCameraCaptureStatus phase={camera.phase} />
      {!camera.stream && !compactStatus && <LocalCameraStatus camera={camera} />}
      <div
        className={`absolute top-1 left-1 grid gap-1 ${width >= 148 ? "grid-cols-3" : narrow ? "grid-cols-1" : "grid-cols-2"}`}
      >
        <LocalCameraToggle camera={camera} compactStatus={compactStatus} />
        <CameraDeviceSetting camera={camera} />
        {showFlip && <CameraFacingToggle camera={camera} />}
      </div>
    </>
  );
}

const cameraControl =
  "size-11 min-h-11 shrink-0 border-border/50 bg-background/60 text-foreground backdrop-blur-sm hover:bg-background/80";
function LocalCameraCaptureStatus({
  phase,
}: {
  phase: ReturnType<typeof useLocalCamera>["phase"];
}) {
  const { t } = useI18n();
  const reducedMotion = useReducedMotion();
  if (phase === "idle") return null;
  return (
    <div
      className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-primary ring-inset"
      role="status"
    >
      <div className="absolute inset-0 bg-primary/10 motion-safe:animate-pulse" />
      {!reducedMotion && (
        <m.div
          className="absolute inset-0 origin-top rounded-2xl border-b-2 border-primary bg-linear-to-b from-transparent to-primary/20"
          initial={{ scaleY: 0, opacity: 0 }}
          animate={{ scaleY: 1, opacity: [0, 0.6, 0] }}
          transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
          aria-hidden="true"
        />
      )}
      <span className="absolute inset-x-1 bottom-1 flex items-center justify-center gap-1 rounded-lg bg-card/60 p-1 text-xs text-foreground backdrop-blur-sm">
        <LoaderCircle className="size-3 shrink-0 motion-safe:animate-spin" />
        {t(phase === "capturing" ? "kiosk_camera_capturing" : "kiosk_camera_reading")}
      </span>
    </div>
  );
}
