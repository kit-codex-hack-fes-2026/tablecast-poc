import { MoveDiagonal2 } from "lucide-react";
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { VoiceCamera, VoiceCameraState } from "./voice-model";
import { useI18n } from "../../i18n/locale";
import { LocalCameraControls, LocalCameraOverlay } from "./local-camera-controls";
import { captureCameraFrame } from "./local-camera-dom";

export function LocalCameraFrame() {
  const camera = useLocalCamera();
  return <LocalCamera camera={camera} />;
}

// 映像の寿命と1枚の取得を所有し、注文・認可・音声接続を扱わない。
export function useLocalCamera() {
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const video = useRef<HTMLVideoElement>(null);
  const generation = useRef(0);
  const state = useRef<VoiceCameraState>({ status: "off" });
  const permission = useRef<PermissionStatus | undefined>(undefined);
  const getState = useCallback((): VoiceCameraState => {
    const access = { permission: permission.current?.state ?? ("unknown" as const) };
    if (permission.current?.state === "denied") return { ...access, status: "permission-denied" };
    if (document.hidden) return { ...access, status: "unavailable" };
    if (!streamRef.current && ["ready", "capturing", "reading"].includes(state.current.status))
      return { ...access, status: "off" };
    if (streamRef.current && (!video.current || video.current.readyState < 2))
      return { ...access, status: "starting" };
    return { ...state.current, ...access };
  }, []);
  const attachVideo = useCallback((element: HTMLVideoElement | null) => {
    video.current = element;
  }, []);
  const facingRef = useRef<"environment" | "user">("user");
  const [hasFacing, setHasFacing] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("user");
  const [phase, setPhase] = useState<"capturing" | "idle" | "reading">("idle");
  const [captureCount, setCaptureCount] = useState(0);
  const complete = useCallback(() => {
    if (streamRef.current) state.current = { ...state.current, status: "ready" };
    setPhase("idle");
  }, []);
  const capture = useCallback<VoiceCamera["capture"]>(
    async (signal, maxBytes) => {
      if (getState().permission === "denied") return { error: "CAMERA_PERMISSION_DENIED" };
      const source = streamRef.current;
      const element = video.current;
      const request = generation.current;
      if (!source)
        return {
          error:
            state.current.status === "permission-denied"
              ? "CAMERA_PERMISSION_DENIED"
              : state.current.status === "starting"
                ? "CAMERA_STARTING"
                : state.current.status === "unavailable"
                  ? "CAMERA_UNAVAILABLE"
                  : "CAMERA_OFF",
        };
      if (!element || document.hidden) return { error: "CAMERA_UNAVAILABLE" };
      if (element.readyState < 2) return { error: "CAMERA_STARTING" };
      state.current = { ...state.current, status: "capturing" };
      setPhase("capturing");
      try {
        const imageUrl = await captureCameraFrame(element, signal, maxBytes);
        if (getState().permission === "denied") {
          setPhase("idle");
          return { error: "CAMERA_PERMISSION_DENIED" };
        }
        if (generation.current !== request || source !== streamRef.current || document.hidden)
          return { error: "CAMERA_UNAVAILABLE" };
        state.current = { ...state.current, status: "reading" };
        setPhase("reading");
        setCaptureCount((count) => count + 1);
        return { imageUrl };
      } catch {
        if (generation.current === request) setPhase("idle");
        return { error: "CAMERA_UNAVAILABLE" };
      }
    },
    [getState],
  );
  const [stream, setStream] = useState<MediaStream>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<"permission" | "unavailable">();
  useEffect(() => {
    let disposed = false;
    // 許可ダイアログを開かず、照会したPermissionStatusの現在値をツール実行時に読む。
    void navigator.permissions
      ?.query({ name: "camera" })
      .then((access) => {
        if (!disposed) permission.current = access;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      permission.current = undefined;
    };
  }, []);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const stop = useCallback(() => {
    generation.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = undefined;
    state.current = { status: "off" };
    setStream(undefined);
    setPending(false);
    setPhase("idle");
    setCaptureCount(0);
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
    async (requestedDeviceId?: string, requestedFacing?: "environment" | "user") => {
      stop();
      const request = generation.current;
      const preferredFacing = requestedFacing ?? facingRef.current;
      state.current = { status: "starting" };
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
              : { facingMode: { ideal: preferredFacing } }),
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
        const actualFacing = next.getVideoTracks()[0]?.getSettings().facingMode;
        setHasFacing(actualFacing === "environment" || actualFacing === "user");
        facingRef.current =
          actualFacing === "environment" || actualFacing === "user"
            ? actualFacing
            : preferredFacing;
        setFacing(facingRef.current);
        state.current = {
          status: "ready",
          ...(actualFacing === "environment" || actualFacing === "user"
            ? { facing: actualFacing }
            : {}),
        };
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
        state.current = {
          status:
            cause instanceof DOMException &&
            ["NotAllowedError", "SecurityError"].includes(cause.name)
              ? "permission-denied"
              : "unavailable",
        };
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
  const flip = useCallback(
    () => start(undefined, facingRef.current === "user" ? "environment" : "user"),
    [start],
  );
  const canFlip =
    typeof navigator !== "undefined" &&
    hasFacing &&
    devices.length > 1 &&
    Boolean(navigator.mediaDevices?.getSupportedConstraints?.().facingMode);
  useLayoutEffect(() => {
    state.current = {
      status: pending
        ? "starting"
        : error === "permission"
          ? "permission-denied"
          : error
            ? "unavailable"
            : stream
              ? phase === "idle"
                ? "ready"
                : phase
              : "off",
      ...(stream && hasFacing ? { facing } : {}),
    };
  }, [pending, error, stream, phase, facing, hasFacing]);
  return {
    stream,
    pending,
    error,
    devices,
    deviceId,
    start,
    stop,
    playbackFailed,
    attachVideo,
    facing,
    mirrored: hasFacing && facing === "user",
    flip,
    canFlip,
    phase,
    captureCount,
    capture,
    complete,
    getState,
  };
}

export function LocalCamera({
  camera,
  boundsRef,
}: {
  boundsRef?: RefObject<HTMLElement | null>;
  camera: ReturnType<typeof useLocalCamera>;
}) {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  const cameraWindow = useRef<HTMLDivElement>(null);
  const [aspectRatio, setAspectRatio] = useState(4 / 3);
  const [preferredWidth, setPreferredWidth] = useState(128);
  const [bounds, setBounds] = useState({ width: 320, height: 240 });
  const drag = useRef<null | { pointerId: number; width: number; x: number; y: number }>(null);
  const maxWidth = Math.min(320, bounds.width, bounds.height * aspectRatio);
  const minWidth = Math.min(
    maxWidth,
    Math.max(100, (camera.canFlip ? 96 : 48) * aspectRatio, Math.min(140, 96 * aspectRatio)),
  );
  const width = Math.min(maxWidth, Math.max(minWidth, preferredWidth));
  const resize = (value: number) =>
    setPreferredWidth(Math.min(maxWidth, Math.max(minWidth, value)));
  const readAspectRatio = () => {
    const source = video.current;
    if (source && source.srcObject === camera.stream && source.videoWidth && source.videoHeight)
      setAspectRatio(source.videoWidth / source.videoHeight);
  };
  useEffect(() => {
    const parent = cameraWindow.current?.parentElement;
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
  const { playbackFailed, attachVideo } = camera;
  useEffect(() => {
    const element = video.current;
    if (!element) return undefined;
    const stream = camera.stream;
    element.srcObject = stream ?? null;
    if (!stream) return undefined;
    attachVideo(element);
    let cancelled = false;
    void element.play().catch(() => {
      if (!cancelled) playbackFailed(stream);
    });
    return () => {
      cancelled = true;
      attachVideo(null);
      if (element.srcObject === stream) {
        element.pause();
        element.srcObject = null;
      }
    };
  }, [camera.stream, playbackFailed, attachVideo]);
  return (
    <div
      ref={cameraWindow}
      className="pointer-events-auto flex min-w-0 shrink-0 self-start flex-col gap-1.5"
      style={{ width }}
      data-ui="camera-window"
    >
      <figure
        className="relative w-full overflow-hidden rounded-2xl bg-control shadow-surface"
        style={{ aspectRatio }}
        data-ui="camera-frame"
        data-camera-state={camera.pending ? "pending" : camera.stream ? "on" : "off"}
        data-capture-state={camera.phase}
      >
        <video
          ref={video}
          autoPlay
          muted
          playsInline
          className={`absolute inset-0 size-full object-contain ${camera.mirrored ? "-scale-x-100" : ""}`}
          aria-label={t("kiosk_camera_mirror")}
          hidden={!camera.stream}
          onLoadedMetadata={readAspectRatio}
          onResize={readAspectRatio}
        />
        <LocalCameraOverlay camera={camera} />
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
            drag.current = {
              pointerId: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              width,
            };
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
      <LocalCameraControls camera={camera} />
    </div>
  );
}
