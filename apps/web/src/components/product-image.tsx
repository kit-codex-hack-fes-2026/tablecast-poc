import { Image } from "@unpic/react/base";
import { useState } from "react";
import { cn } from "tailwind-variants";

function transformImage(src: string | URL, { width = 640 }: { width?: number }) {
  const path = String(src).split("?")[0];
  return `${path}?width=${Math.min(1600, Math.max(1, Math.round(width)))}`;
}

/**
 * 商品写真と画像の失敗時表示。
 * src・alt・width・heightが必須。
 * sizesは実際の表示幅、priorityは先頭の重要画像のみ、blurDataURLは生成済みplaceholder、onErrorは代替表示の通知に使う。
 * 表示幅に合う画像を既存の配送経路から取得し、無意味な別URLや原寸画像を指定しない。
 * 写真は商品名・価格の代替ではない。
 */
export function ProductImage({
  src,
  alt,
  width,
  height,
  sizes,
  className,
  priority = false,
  blurDataURL,
  onError,
}: {
  alt: string;
  blurDataURL?: `data:image/${string}`;
  className?: string;
  height: number;
  onError?: () => void;
  priority?: boolean;
  sizes?: string;
  src: string;
  width: number;
}) {
  const [settledSrc, setSettledSrc] = useState<string>();
  const background = blurDataURL && settledSrc !== src ? blurDataURL : undefined;
  const imageStyle = {
    "--tablecast-image-ratio": `${width} / ${height}`,
    "--tablecast-image-placeholder": background ? `url("${background}")` : "none",
  };
  return (
    <span
      key={src}
      style={{ display: "contents", ...imageStyle }}
      ref={
        blurDataURL
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
        onLoad={blurDataURL ? () => setSettledSrc(src) : undefined}
        onError={() => {
          if (blurDataURL) setSettledSrc(src);
          onError?.();
        }}
        className={cn(
          "object-contain aspect-(--tablecast-image-ratio) [background-image:var(--tablecast-image-placeholder)] bg-contain bg-center bg-no-repeat",
          className,
        )}
        transformer={transformImage}
        breakpoints={[64, 96, 128, 192, 256, 384, 416, 512, 640, 768, 960, 1280, 1600]}
      />
    </span>
  );
}
