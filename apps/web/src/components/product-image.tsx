import { blurhashToDataUri } from "@unpic/placeholder";
import { Image } from "@unpic/react/base";
import { useState } from "react";
import { cn } from "tailwind-variants";
import { useMediaImage } from "./image-provider";

function transformImage(src: string | URL, { width = 640 }: { width?: number }) {
  const path = String(src).split("?")[0];
  return `${path}?width=${Math.min(1600, Math.max(1, Math.round(width)))}`;
}

function imageBreakpoints(sizes?: string, originalWidth = 1600) {
  const fixedWidth = sizes && /^\d+px$/.test(sizes) ? Number.parseInt(sizes, 10) : undefined;
  const maximum = Math.min(1600, originalWidth, fixedWidth ? fixedWidth * 3 : 1600);
  const candidates = fixedWidth
    ? [fixedWidth, fixedWidth * 2, fixedWidth * 3]
    : [32, 64, 96, 128, 192, 256, 384, 416, 512, 640, 768, 960, 1280, 1600];
  return [...new Set([...candidates.filter((value) => value < maximum), maximum])];
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
  const hash = blurhash ?? asset?.blurhash;
  const placeholder = hash ? blurhashToDataUri(hash) : undefined;
  if (natural && asset) {
    width = asset.width;
    height = asset.height;
  }
  const [settledSrc, setSettledSrc] = useState<string>();
  const background = placeholder && settledSrc !== src ? placeholder : undefined;
  const breakpoints = imageBreakpoints(responsive ? undefined : sizes, asset?.width);
  const imageStyle = {
    "--tablecast-image-ratio": `${width} / ${height}`,
    "--tablecast-image-placeholder": background ? `url("${background}")` : "none",
  };
  return (
    <span
      key={src}
      style={{ display: "contents", ...imageStyle }}
      ref={
        placeholder
          ? (frame) => {
              const image = frame?.querySelector("img");
              if (image?.currentSrc && image.complete) setSettledSrc(src);
            }
          : undefined
      }
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
        onLoad={placeholder ? () => setSettledSrc(src) : undefined}
        onError={() => {
          if (placeholder) setSettledSrc(src);
          onError?.();
        }}
        className={cn(
          "object-contain aspect-(--tablecast-image-ratio) [background-image:var(--tablecast-image-placeholder)] bg-contain bg-center bg-no-repeat",
          className,
        )}
        transformer={(input: string | URL, options: { width?: number }) =>
          transformImage(input, { width: Math.min(options.width ?? 640, asset?.width ?? 1600) })
        }
        breakpoints={breakpoints}
      />
    </span>
  );
}
