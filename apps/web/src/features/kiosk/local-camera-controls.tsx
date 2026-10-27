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
  const Icon = camera.error ? CircleAlert : camera.pending ? LoaderCircle : CameraOff;
  return (
    <div
      className={`absolute inset-0 flex items-center justify-center ${camera.error ? "text-destructive" : "text-muted-foreground/60"}`}
      role={camera.error ? "alert" : "img"}
      aria-label={t(message)}
    >
      <Icon
        className={`size-6 ${camera.pending ? "motion-safe:animate-spin" : ""}`}
        aria-hidden="true"
      />
      <span className="sr-only">{t(message)}</span>
    </div>
  );
}

function LocalCameraToggle({ camera }: { camera: ReturnType<typeof useLocalCamera> }) {
  const { t } = useI18n();
  const enabled = Boolean(camera.stream || camera.pending);
  const label = t(enabled ? "kiosk_camera_stop" : "kiosk_camera_start");
  const errorMessages = {
    permission: "kiosk_camera_permission",
    unavailable: "kiosk_camera_unavailable",
  } as const;
  const accessibleLabel = camera.error ? `${label}: ${t(errorMessages[camera.error])}` : label;
  return (
    <Button
      variant={camera.error ? "destructive" : camera.stream ? "secondary" : "outline"}
      size="icon"
      className={cameraControl}
      aria-label={accessibleLabel}
      title={accessibleLabel}
      aria-pressed={Boolean(camera.stream)}
      onClick={() => (enabled ? camera.stop() : void camera.start())}
    >
      {camera.pending ? (
        <LoaderCircle className="motion-safe:animate-spin" />
      ) : camera.error ? (
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

export function LocalCameraOverlay({ camera }: { camera: ReturnType<typeof useLocalCamera> }) {
  const reduced = useReducedMotion();
  return (
    <>
      {camera.stream && camera.captureCount > 0 && !reduced && (
        <m.div
          key={camera.captureCount}
          data-ui="camera-shutter"
          data-capture-count={camera.captureCount}
          className="pointer-events-none absolute inset-0 z-10 bg-on-inverse"
          initial={{ opacity: 0.85 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          aria-hidden="true"
        />
      )}
      <LocalCameraCaptureStatus phase={camera.phase} />
      {!camera.stream && <LocalCameraStatus camera={camera} />}
    </>
  );
}

export function LocalCameraControls({ camera }: { camera: ReturnType<typeof useLocalCamera> }) {
  return (
    <div data-ui="camera-controls" className="flex flex-wrap items-center justify-start gap-1">
      <LocalCameraToggle camera={camera} />
      <CameraDeviceSetting camera={camera} />
      <CameraFacingToggle camera={camera} />
    </div>
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
      <span className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-card/60 text-foreground backdrop-blur-sm">
        <LoaderCircle className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />
        <span className="sr-only">
          {t(phase === "capturing" ? "kiosk_camera_capturing" : "kiosk_camera_reading")}
        </span>
      </span>
    </div>
  );
}
