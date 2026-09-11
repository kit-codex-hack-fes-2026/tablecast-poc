import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/locale";

export function DemoViewport({
  src,
  tablet,
  portrait,
}: {
  src: string;
  tablet: boolean;
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
  const width = portrait ? 820 : 1180;
  const height = portrait ? 1180 : 820;
  // iframeの論理viewportを固定し、枠を含む表示だけを利用可能な領域へ縮小する。
  const scale = Math.max(
    0,
    Math.min(1, (size.width - 32) / (width + 32), (size.height - 32) / (height + 32)),
  );
  return (
    <div
      ref={area}
      className="relative min-h-0 flex-1 overflow-hidden bg-secondary"
      data-testid="demo-viewport"
    >
      <div
        className={
          tablet
            ? "absolute left-1/2 top-1/2 origin-center rounded-3xl border-16 border-slate-900 bg-slate-900 shadow-xl"
            : "absolute inset-0"
        }
        style={
          tablet
            ? {
                width: width + 32,
                height: height + 32,
                transform: `translate(-50%, -50%) scale(${scale})`,
              }
            : undefined
        }
      >
        {/* 自アプリの認証とマイクを使うため同一originのscript実行が必要。外部URLは受け取らない。 */}
        {/* oxlint-disable react/iframe-missing-sandbox, react-doctor/iframe-missing-sandbox */}
        <iframe
          title={t("demo_screen")}
          src={src}
          allow="microphone; autoplay"
          sandbox="allow-scripts allow-same-origin"
          className={
            tablet
              ? "block size-full rounded-xl border-0 bg-background"
              : "block size-full border-0 bg-background"
          }
        />
        {/* oxlint-enable react/iframe-missing-sandbox, react-doctor/iframe-missing-sandbox */}
      </div>
    </div>
  );
}
