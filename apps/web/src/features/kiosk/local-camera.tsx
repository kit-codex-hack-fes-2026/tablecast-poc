import { Camera, CameraOff, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";

export function LocalCameraFrame() {
  const camera = useLocalCamera();
  return <LocalCamera camera={camera} />;
}

// 鏡専用。VoiceConnectionへ渡さず、映像の送信・保存・フレーム取得を行わない。
export function useLocalCamera() {
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const generation = useRef(0);
  const [stream, setStream] = useState<MediaStream>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<"permission" | "unavailable">();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const stop = useCallback(() => {
    generation.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = undefined;
    setStream(undefined);
    setPending(false);
  }, []);
  const start = useCallback(
    async (deviceId?: string) => {
      stop();
      const request = generation.current;
      setError(undefined);
      setPending(true);
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera unavailable");
        const next = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "user" }),
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
        });
        if (generation.current !== request || document.hidden) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = next;
        setStream(next);
        setPending(false);
        next
          .getVideoTracks()
          .forEach((track) => track.addEventListener("ended", stop, { once: true }));
        const available = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        if (generation.current === request)
          setDevices(available.filter((device) => device.kind === "videoinput"));
      } catch (cause) {
        if (generation.current !== request) return;
        setPending(false);
        setError(
          cause instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(cause.name)
            ? "permission"
            : "unavailable",
        );
      }
    },
    [stop],
  );
  useEffect(() => {
    const hide = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", stop);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", stop);
      stop();
    };
  }, [stop]);
  return { stream, pending, error, devices, start, stop };
}

export function LocalCamera({
  camera,
  showError = true,
}: {
  camera: ReturnType<typeof useLocalCamera>;
  showError?: boolean;
}) {
  const { t } = useI18n();
  const enabled = Boolean(camera.stream || camera.pending);
  const actionLabel = t(enabled ? "kiosk_camera_stop" : "kiosk_camera_start");
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!video.current) return;
    video.current.srcObject = camera.stream ?? null;
  }, [camera.stream]);
  return (
    <div className="grid min-w-0 content-start gap-2" data-ui="local-camera">
      <figure
        className="relative aspect-4/3 overflow-hidden rounded-2xl bg-control shadow-surface"
        data-ui="camera-frame"
        data-camera-state={camera.pending ? "pending" : camera.stream ? "on" : "off"}
      >
        <video
          ref={video}
          autoPlay
          muted
          playsInline
          className="absolute inset-0 size-full -scale-x-100 object-contain"
          aria-label={t("kiosk_camera_mirror")}
          hidden={!camera.stream}
        />
        {!camera.stream && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pb-12 text-muted-foreground max-[56rem]:hidden">
            {camera.pending ? (
              <LoaderCircle className="size-6 motion-safe:animate-spin" />
            ) : (
              <CameraOff className="size-6" />
            )}
            <span className="text-xs">
              {t(camera.pending ? "common_loading" : "kiosk_camera_off")}
            </span>
          </div>
        )}
        <figcaption className="absolute top-2 left-2 max-w-[calc(100%-1rem)] rounded-lg bg-glass px-2 py-1 text-xs text-foreground max-[56rem]:sr-only">
          {t("kiosk_camera_local")}
        </figcaption>
        <Button
          variant={camera.stream ? "default" : "outline"}
          size="sm"
          className="absolute right-2 bottom-2 max-w-[calc(100%-1rem)] max-[56rem]:size-11 max-[56rem]:p-0"
          aria-label={actionLabel}
          title={actionLabel}
          aria-pressed={Boolean(camera.stream)}
          onClick={() => (enabled ? camera.stop() : void camera.start())}
        >
          {camera.pending ? (
            <LoaderCircle className="motion-safe:animate-spin" />
          ) : camera.stream ? (
            <CameraOff />
          ) : (
            <Camera />
          )}
          <span className="max-[56rem]:hidden">{actionLabel}</span>
        </Button>
      </figure>
      {camera.stream && camera.devices.length > 1 && (
        <label className="min-w-0 flex-1 text-xs">
          <span className="sr-only">{t("kiosk_camera_device")}</span>
          <NativeSelect
            value={camera.stream.getVideoTracks()[0]?.getSettings().deviceId ?? ""}
            onChange={(event) => void camera.start(event.target.value)}
          >
            {camera.devices.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `${t("kiosk_camera_device")} ${index + 1}`}
              </option>
            ))}
          </NativeSelect>
        </label>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">{t("kiosk_camera_privacy")}</p>
      {showError && <LocalCameraError error={camera.error} />}
    </div>
  );
}

export function LocalCameraError({ error }: { error: ReturnType<typeof useLocalCamera>["error"] }) {
  const { t } = useI18n();
  if (!error) return null;
  return (
    <p role="alert" className="rounded-xl bg-destructive-soft px-3 py-2 text-sm text-destructive">
      {t(error === "permission" ? "kiosk_camera_permission" : "kiosk_camera_unavailable")}
    </p>
  );
}
