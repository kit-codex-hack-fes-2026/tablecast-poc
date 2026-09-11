import { useEffect, useRef, useState } from "react";
import { type DemoDevice, demoDevices } from "./demo-device-model";
import { DemoDeviceFrame } from "./demo-device-frame";
import { useI18n } from "../../i18n/locale";

export function DemoViewport({
  src,
  device,
  portrait,
}: {
  src: string;
  device: DemoDevice;
  portrait: boolean;
}) {
  const { t } = useI18n();
  const area = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = area.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const frame = device === "browser" ? null : demoDevices[device];
  const width = frame ? (portrait ? frame.width : frame.height) : size.width;
  const height = frame ? (portrait ? frame.height : frame.width) : size.height;
  const bezel = frame ? frame.bezel + 6 : 0;
  const frameWidth = width + bezel * 2;
  const frameHeight = height + bezel * 2;
  // iframeの論理viewportを固定し、枠を含む表示だけを利用可能な領域へ縮小する。
  const scale = Math.max(
    0,
    Math.min(1, (size.width - 32) / frameWidth, (size.height - 32) / frameHeight),
  );
  return (
    <div
      ref={area}
      className="relative min-h-0 flex-1 overflow-hidden bg-secondary"
      data-testid="demo-viewport"
    >
      <div
        className={frame ? "absolute left-1/2 top-1/2 origin-center" : "absolute inset-0"}
        style={
          frame
            ? {
                width: frameWidth,
                height: frameHeight,
                transform: `translate(-50%, -50%) scale(${scale})`,
              }
            : undefined
        }
      >
        {device !== "browser" && <DemoDeviceFrame device={device} portrait={portrait} />}
        {/* 自アプリの認証とマイクを使うため同一originのscript実行が必要。外部URLは受け取らない。 */}
        {/* oxlint-disable react/iframe-missing-sandbox, react-doctor/iframe-missing-sandbox */}
        <iframe
          title={t("demo_screen")}
          src={src}
          allow="microphone; autoplay"
          sandbox="allow-scripts allow-same-origin"
          className="absolute block size-full border-0 bg-background"
          style={frame ? { left: bezel, top: bezel, width, height, borderRadius: 18 } : undefined}
        />
        {/* oxlint-enable react/iframe-missing-sandbox, react-doctor/iframe-missing-sandbox */}
      </div>
    </div>
  );
}
