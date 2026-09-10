import { tv } from "tailwind-variants";
import { useHydrated } from "@tanstack/react-router";
import {
  Camera,
  CircleCheck,
  ImageUp,
  LoaderCircle,
  ScanQrCode,
  Square,
  TriangleAlert,
} from "lucide-react";
import type QrScanner from "qr-scanner";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { readDeviceQrCode } from "./device-qr-code";

const scanMessage = tv({
  base: "flex items-start gap-2 rounded-lg p-3 text-base",
  variants: {
    error: { true: "bg-destructive/10 text-destructive", false: "bg-secondary text-foreground" },
  },
});

export function DeviceQrReader({ onRead }: { onRead: (code: string) => void }) {
  const { t } = useI18n();
  const hydrated = useHydrated();
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState<"success" | "invalid" | "camera" | "image" | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const read = (value: string) => {
    const code = readDeviceQrCode(value, window.location.origin);
    setNotice(code ? "success" : "invalid");
    if (!code) return;
    setScanning(false);
    onRead(code);
  };
  const imageRead = useEffectEvent(read);
  useEffect(() => {
    if (!file) return undefined;
    let disposed = false;
    void import("qr-scanner")
      .then(({ default: Scanner }) => Scanner.scanImage(file, { returnDetailedScanResult: true }))
      .then((result) => {
        if (!disposed) imageRead(result.data);
      })
      .catch(() => {
        if (!disposed) setNotice("image");
      })
      .finally(() => {
        if (!disposed) setFile(null);
      });
    return () => {
      disposed = true;
    };
  }, [file]);
  const hasError = notice !== null && notice !== "success";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={file !== null}
          aria-expanded={scanning}
          onClick={() => {
            setScanning(!scanning);
            setNotice(null);
          }}
        >
          {scanning ? <Square /> : <ScanQrCode />}
          {t(scanning ? "device_scan_stop" : "device_scan_start")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={file !== null}
          onClick={() => fileInput.current?.click()}
        >
          <ImageUp />
          {t("device_scan_image")}
        </Button>
        <input
          ref={fileInput}
          type="file"
          disabled={!hydrated}
          accept="image/*"
          className="hidden"
          aria-label={t("device_scan_image")}
          onChange={(event) => {
            const selectedFile = event.target.files?.[0];
            event.target.value = "";
            if (!selectedFile) return;
            setScanning(false);
            setNotice(null);
            setFile(selectedFile);
          }}
        />
      </div>
      {scanning && (
        <CameraReader
          onRead={read}
          onError={() => {
            setScanning(false);
            setNotice("camera");
          }}
        />
      )}
      {(notice || file) && (
        <div role={hasError ? "alert" : "status"} className={scanMessage({ error: hasError })}>
          {file ? (
            <LoaderCircle className="mt-0.5 size-5 shrink-0 animate-spin motion-reduce:animate-none" />
          ) : hasError ? (
            <TriangleAlert className="mt-0.5 size-5 shrink-0" />
          ) : (
            <CircleCheck className="mt-0.5 size-5 shrink-0" />
          )}
          <span>
            {t(
              file !== null
                ? "common_loading"
                : notice === "image"
                  ? "device_scan_image_error"
                  : notice === "camera"
                    ? "device_scan_camera_error"
                    : notice === "invalid"
                      ? "device_scan_invalid"
                      : "device_scan_success",
            )}
          </span>
        </div>
      )}
    </div>
  );
}

function CameraReader({
  onRead,
  onError,
}: {
  onRead: (value: string) => void;
  onError: () => void;
}) {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  const decoded = useEffectEvent(onRead);
  const failed = useEffectEvent(onError);
  useEffect(() => {
    const preview = video.current;
    if (!preview) return undefined;
    let scanner: QrScanner | undefined;
    let disposed = false;
    async function start() {
      const { default: Scanner } = await import("qr-scanner");
      if (disposed || !preview) return;
      scanner = new Scanner(preview, (result) => decoded(result.data), {
        preferredCamera: "environment",
        maxScansPerSecond: 10,
        returnDetailedScanResult: true,
      });
      await scanner.start();
    }
    void start().catch(() => {
      if (!disposed) failed();
    });
    return () => {
      disposed = true;
      scanner?.destroy();
      // 再生開始の失敗時も、取得済みのカメラを残さない。
      if (preview.srcObject instanceof MediaStream)
        for (const track of preview.srcObject.getTracks()) track.stop();
      preview.srcObject = null;
    };
  }, []);
  return (
    <div className="max-w-sm space-y-2">
      <video
        ref={video}
        muted
        playsInline
        aria-label={t("device_scan_camera")}
        className="aspect-square w-full rounded-xl bg-black object-cover"
      />
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Camera className="size-4 shrink-0" />
        {t("device_scan_aim")}
      </p>
    </div>
  );
}
