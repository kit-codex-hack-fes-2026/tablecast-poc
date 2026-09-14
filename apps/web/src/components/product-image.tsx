import { Image } from "@unpic/react/base";
import { useState } from "react";
import { cn } from "tailwind-variants";

function transformImage(src: string | URL, { width = 640 }: { width?: number }) {
  const path = String(src).split("?")[0];
  return `${path}?width=${Math.min(1600, Math.max(1, Math.round(width)))}`;
}

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
  src: string;
  alt: string;
  width: number;
  height: number;
  sizes?: string;
  className?: string;
  priority?: boolean;
  blurDataURL?: `data:image/${string}`;
  onError?: () => void;
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
        objectFit="contain"
        unstyled
        priority={priority}
        onLoad={blurDataURL ? () => setSettledSrc(src) : undefined}
        onError={() => {
          if (blurDataURL) setSettledSrc(src);
          onError?.();
        }}
        className={cn(
          "aspect-(--tablecast-image-ratio) [background-image:var(--tablecast-image-placeholder)] bg-contain bg-center bg-no-repeat",
          className,
        )}
        transformer={transformImage}
        breakpoints={[64, 96, 128, 192, 256, 384, 512, 640, 768, 960, 1280, 1600]}
      />
    </span>
  );
}
