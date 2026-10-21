import { Select as SelectPrimitive } from "@base-ui/react/select";
import {
  Camera,
  CameraOff,
  CircleAlert,
  MoveDiagonal2,
  LoaderCircle,
  SlidersHorizontal,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectItem } from "../../components/ui/select";
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
  const [deviceId, setDeviceId] = useState("");
  const stop = useCallback(() => {
    generation.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = undefined;
    setStream(undefined);
    setPending(false);
  }, []);
  const playbackFailed = useCallback(
    (failedStream: MediaStream) => {
      if (streamRef.current !== failedStream) return;
      stop();
      setError("unavailable");
    },
    [stop],
  );
  const start = useCallback(
    async (requestedDeviceId?: string) => {
      stop();
      const request = generation.current;
      setError(undefined);
      setPending(true);
      setDeviceId(requestedDeviceId ?? "");
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera unavailable");
        const next = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            ...(requestedDeviceId
              ? { deviceId: { exact: requestedDeviceId } }
              : { facingMode: "user" }),
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
        setDeviceId(next.getVideoTracks()[0]?.getSettings().deviceId ?? requestedDeviceId ?? "");
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
  return { stream, pending, error, devices, deviceId, start, stop, playbackFailed };
}

export function LocalCamera({
  camera,
  boundsRef,
}: {
  camera: ReturnType<typeof useLocalCamera>;
  boundsRef?: RefObject<HTMLElement | null>;
}) {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLElement>(null);
  const [aspectRatio, setAspectRatio] = useState(4 / 3);
  const [preferredWidth, setPreferredWidth] = useState(128);
  const [bounds, setBounds] = useState({ width: 320, height: 240 });
  const drag = useRef<{ pointerId: number; x: number; y: number; width: number } | null>(null);
  const maxWidth = Math.min(320, bounds.width, bounds.height * aspectRatio);
  const minWidth = Math.min(
    maxWidth,
    Math.max(100, 48 * aspectRatio, Math.min(140, 96 * aspectRatio)),
  );
  const width = Math.min(maxWidth, Math.max(minWidth, preferredWidth));
  const narrow = width < 100;
  const controlsAtTop = narrow || (camera.devices.length > 1 && width < 140);
  const compactStatus = width / aspectRatio < 80 || controlsAtTop;
  const resize = (value: number) =>
    setPreferredWidth(Math.min(maxWidth, Math.max(minWidth, value)));
  const readAspectRatio = () => {
    const source = video.current;
    if (source && source.srcObject === camera.stream && source.videoWidth && source.videoHeight)
      setAspectRatio(source.videoWidth / source.videoHeight);
  };
  useEffect(() => {
    const parent = frame.current?.parentElement;
    if (!parent) return undefined;
    const container = boundsRef?.current;
    const update = () => {
      const style = getComputedStyle(parent);
      setBounds({
        width: Math.max(
          0,
          parent.clientWidth -
            Number.parseFloat(style.paddingLeft) -
            Number.parseFloat(style.paddingRight),
        ),
        height: container
          ? Math.min(240, container.clientHeight, Math.max(144, container.clientHeight * 0.4))
          : 240,
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(parent);
    if (container && container !== parent) observer.observe(container);
    update();
    return () => observer.disconnect();
  }, [boundsRef]);
  const { playbackFailed } = camera;
  useEffect(() => {
    const element = video.current;
    if (!element) return undefined;
    const stream = camera.stream;
    element.srcObject = stream ?? null;
    if (!stream) return undefined;
    let cancelled = false;
    void element.play().catch(() => {
      if (!cancelled) playbackFailed(stream);
    });
    return () => {
      cancelled = true;
      if (element.srcObject === stream) {
        element.pause();
        element.srcObject = null;
      }
    };
  }, [camera.stream, playbackFailed]);
  return (
    <figure
      ref={frame}
      className="relative min-w-0 shrink-0 self-start overflow-hidden rounded-2xl bg-control shadow-surface"
      style={{ width, aspectRatio }}
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
        onLoadedMetadata={readAspectRatio}
        onResize={readAspectRatio}
      />
      {!camera.stream && !compactStatus && <LocalCameraStatus camera={camera} narrow={narrow} />}
      <div
        className={`absolute left-1 flex gap-1 ${controlsAtTop ? "top-1" : "bottom-1"} ${narrow ? "flex-col" : ""}`}
      >
        <CameraDeviceSetting camera={camera} />
        <LocalCameraToggle camera={camera} compactStatus={compactStatus} />
      </div>
      <div
        role="separator"
        tabIndex={0}
        aria-label={t("kiosk_camera_resize")}
        aria-orientation="vertical"
        aria-valuemin={Math.round(minWidth)}
        aria-valuemax={Math.round(maxWidth)}
        aria-valuenow={Math.round(width)}
        title={t("kiosk_camera_resize")}
        className="group absolute right-0 bottom-0 flex size-11 touch-none cursor-nwse-resize items-end justify-end p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        onPointerDown={(event) => {
          if (drag.current || !event.isPrimary || event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, width };
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start || event.pointerId !== start.pointerId) return;
          const x = event.clientX - start.x;
          const y = (event.clientY - start.y) * aspectRatio;
          resize(start.width + (Math.abs(x) >= Math.abs(y) ? x : y));
        }}
        onPointerUp={(event) => {
          if (drag.current?.pointerId !== event.pointerId) return;
          drag.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={(event) => {
          if (drag.current?.pointerId !== event.pointerId) return;
          resize(drag.current.width);
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 32 : 16;
          const next = {
            ArrowRight: width + step,
            ArrowDown: width + step,
            ArrowLeft: width - step,
            ArrowUp: width - step,
            Home: minWidth,
            End: maxWidth,
          }[event.key];
          if (next !== undefined) {
            event.preventDefault();
            resize(next);
          } else if (event.key === "Escape" && drag.current) {
            event.preventDefault();
            const start = drag.current;
            resize(start.width);
            drag.current = null;
            event.currentTarget.releasePointerCapture(start.pointerId);
          }
        }}
      >
        <MoveDiagonal2
          className="size-4 rounded-sm bg-control/90 group-hover:bg-control-hover"
          aria-hidden="true"
        />
      </div>
    </figure>
  );
}

function LocalCameraStatus({
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
