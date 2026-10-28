import { imageDeliveryVersion } from "@tablecast/api/schema";
import { blurhashToDataUri } from "@unpic/placeholder";
import { Image } from "@unpic/react/base";
import { type CSSProperties, useCallback, useMemo, useState } from "react";
import { cn } from "tailwind-variants";
import { useMediaImage } from "./image-provider";

function transformImage(src: string | URL, { width = 640 }: { width?: number }) {
  const path = String(src).split("?")[0];
  return `${path}?width=${Math.min(1600, Math.max(1, Math.round(width)))}&v=${imageDeliveryVersion}`;
}

function imageBreakpoints(sizes?: string, originalWidth = 1600) {
  const fixedWidth = sizes && /^\d+px$/.test(sizes) ? Number.parseInt(sizes, 10) : undefined;
  const maximum = Math.min(1600, originalWidth, fixedWidth ? fixedWidth * 3 : 1600);
  const candidates = fixedWidth
    ? [fixedWidth, fixedWidth * 2, fixedWidth * 3]
    : [32, 64, 96, 128, 192, 256, 384, 416, 512, 640, 768, 960, 1280, 1600];
  return [...new Set([...candidates.filter((value) => value < maximum), maximum])];
}

/** placeholderの復元と、decode・再利用・差替えの寿命を同じ場所で管理する。 */
function useImagePlaceholder(
  src: string,
  hash: string | undefined,
  width: number,
  height: number,
  onError?: () => void,
) {
  const data = useMemo(() => {
    if (!hash) return undefined;
    const scale = 16 / Math.max(width, height);
    return blurhashToDataUri(
      hash,
      Math.max(1, Math.round(width * scale)),
      Math.max(1, Math.round(height * scale)),
    );
  }, [hash, width, height]);
  const [settled, setSettled] = useState<{ src: string; state: "finished" | "loaded" }>();
  const state = settled?.src === src ? settled.state : "pending";
  const finish = () => setSettled({ src, state: "finished" });
  const fail = () => {
    finish();
    onError?.();
  };
  const frameRef = useCallback(
    (frame: HTMLSpanElement | null) => {
      const image = frame?.querySelector("img");
      // 読込済みの再利用とSSR後のhydrationでは、待機表示の演出を繰り返さない。
      if (data && image?.currentSrc && image.complete) setSettled({ src, state: "finished" });
    },
    [data, src],
  );
  async function load(image: HTMLImageElement) {
    if (!data) return;
    const selected = image.currentSrc;
    const current = () => image.isConnected && image.currentSrc === selected;
    try {
      await image.decode();
    } catch {
      if (current()) fail();
      return;
    }
    if (!current()) return;
    const next = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "finished"
      : "loaded";
    setSettled((previous) =>
      previous?.src === src && previous.state === "finished" ? previous : { src, state: next },
    );
  }
  return {
    background: state === "finished" ? undefined : data,
    fail,
    finish,
    frameRef,
    hasPlaceholder: data !== undefined,
    load,
    state,
  };
}

/**
 * 商品写真と画像の失敗時表示。
 * src・alt・width・heightが必須。
 * sizesは実際の表示幅、priorityは先頭の重要画像のみ、blurhashは取込時に生成したplaceholder、onErrorは代替表示の通知に使う。
 * 表示幅に合う画像を既存の配送経路から取得し、無意味な別URLや原寸画像を指定しない。
 * 写真は商品名・価格の代替ではない。
 */
export function ProductImage({
  src: source,
  alt,
  width,
  height,
  sizes,
  className,
  priority = false,
  blurhash,
  natural = false,
  responsive = false,
  onError,
}: {
  alt: string;
  blurhash?: string;
  className?: string;
  height: number;
  natural?: boolean;
  onError?: () => void;
  priority?: boolean;
  responsive?: boolean;
  sizes?: string;
  src: string;
  width: number;
}) {
  const { src, asset } = useMediaImage(source);
  const { background, fail, finish, frameRef, hasPlaceholder, load, state } = useImagePlaceholder(
    src,
    blurhash ?? asset?.blurhash,
    asset?.width ?? width,
    asset?.height ?? height,
    onError,
  );
  if (natural && asset) {
    width = asset.width;
    height = asset.height;
  }
  const breakpoints = imageBreakpoints(responsive ? undefined : sizes, asset?.width);
  const imageStyle: CSSProperties & Record<`--${string}`, string> = {
    "--tablecast-image-width": `${width}px`,
    "--tablecast-image-height": `${height}px`,
    "--tablecast-image-ratio": `${width} / ${height}`,
    "--tablecast-image-placeholder": background ? `url("${background}")` : "none",
  };
  return (
    <span
      key={src}
      data-image-state={state}
      style={imageStyle}
      className={cn(
        "relative inline-block h-(--tablecast-image-height) w-(--tablecast-image-width) max-w-full overflow-hidden align-middle aspect-(--tablecast-image-ratio)",
        className,
      )}
      ref={frameRef}
    >
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes={priority ? sizes : `auto, ${sizes ?? `${width}px`}`}
        layout="fixed"
        unstyled
        priority={priority}
        onLoad={(event) => void load(event.currentTarget)}
        onError={fail}
        className={cn("block size-full object-contain aspect-(--tablecast-image-ratio)", className)}
        transformer={(input: string | URL, options: { width?: number }) =>
          transformImage(input, { width: Math.min(options.width ?? 640, asset?.width ?? 1600) })
        }
        breakpoints={breakpoints}
      />
      {hasPlaceholder && (
        <span
          aria-hidden="true"
          data-ui="image-placeholder"
          className={cn(
            "pointer-events-none absolute inset-0 bg-contain bg-center bg-no-repeat blur-[4px] [background-image:var(--tablecast-image-placeholder)]",
            state === "pending" ? "opacity-100" : "opacity-0",
            state === "loaded" &&
              "transition-opacity duration-(--motion-state) ease-(--motion-ease-out) motion-reduce:transition-none",
          )}
          onTransitionEnd={(event) => {
            if (event.target === event.currentTarget && event.propertyName === "opacity") finish();
          }}
        />
      )}
    </span>
  );
}
