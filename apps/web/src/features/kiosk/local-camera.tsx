import { Camera, CameraOff, LoaderCircle, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { NativeSelect } from "../../components/ui/native-select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { useI18n } from "../../i18n/locale";

export function LocalCameraDialog() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const camera = useLocalCamera();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) camera.stop();
        setOpen(next);
      }}
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("kiosk_camera_mirror")}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Camera aria-hidden="true" />
      </Button>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("kiosk_camera_mirror")}</DialogTitle>
          <DialogClose aria-label={t("common_close")}>
            <X />
          </DialogClose>
        </DialogHeader>
        <LocalCamera camera={camera} />
      </DialogContent>
    </Dialog>
  );
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

export function LocalCamera({ camera }: { camera: ReturnType<typeof useLocalCamera> }) {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!video.current) return;
    video.current.srcObject = camera.stream ?? null;
  }, [camera.stream]);
  return (
    <div className="space-y-2">
      {camera.stream && (
        <figure className="relative overflow-hidden rounded-xl bg-black">
          <video
            ref={video}
            autoPlay
            muted
            playsInline
            className="aspect-video w-full -scale-x-100 object-contain"
            aria-label={t("kiosk_camera_mirror")}
          />
          <figcaption className="absolute bottom-2 left-2 rounded-md bg-black/75 px-2 py-1 text-xs text-white">
            {t("kiosk_camera_local")}
          </figcaption>
        </figure>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={camera.stream ? "default" : "outline"}
          size="lg"
          aria-pressed={Boolean(camera.stream)}
          onClick={() => (camera.stream || camera.pending ? camera.stop() : void camera.start())}
        >
          {camera.pending ? (
            <LoaderCircle className="motion-safe:animate-spin" />
          ) : camera.stream ? (
            <CameraOff />
          ) : (
            <Camera />
          )}
          {t(camera.stream || camera.pending ? "kiosk_camera_stop" : "kiosk_camera_start")}
        </Button>
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
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{t("kiosk_camera_privacy")}</p>
      {camera.error && (
        <p role="alert" className="text-sm text-destructive">
          {t(
            camera.error === "permission" ? "kiosk_camera_permission" : "kiosk_camera_unavailable",
          )}
        </p>
      )}
    </div>
  );
}
