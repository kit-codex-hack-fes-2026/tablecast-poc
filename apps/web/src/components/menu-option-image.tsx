import type { Modifier } from "@tablecast/api/schema";
import { ImageOff } from "lucide-react";
import { useState } from "react";
import { IllustrationNotice } from "./illustration-notice";
import { ProductImage } from "./product-image";

export function MenuOptionImage({
  imageKey,
  imageKind,
  compact = false,
  showIllustration = true,
  reserveImageSpace = false,
}: Pick<Modifier["options"][number], "imageKey" | "imageKind"> & {
  compact?: boolean;
  reserveImageSpace?: boolean;
  showIllustration?: boolean;
}) {
  const [failedKey, setFailedKey] = useState<null | string>(null);
  const size = compact ? 32 : 96;
  const sizeClassName = compact ? "size-8" : "size-24";
  if (!imageKey)
    return reserveImageSpace ? (
      <span aria-hidden="true" className={`shrink-0 ${sizeClassName}`} />
    ) : null;
  return (
    <span className={`relative flex shrink-0 ${sizeClassName}`}>
      <span
        ref={(frame) => {
          const image = frame?.querySelector("img");
          if (image?.currentSrc && image.complete && image.naturalWidth === 0)
            setFailedKey(imageKey);
        }}
        aria-hidden="true"
        className={`flex items-center justify-center overflow-hidden rounded-lg bg-surface-subtle ${sizeClassName}`}
      >
        {failedKey === imageKey ? (
          <ImageOff className="size-6 text-muted-foreground" />
        ) : (
          <ProductImage
            src={`/media/${imageKey}`}
            alt=""
            width={size}
            height={size}
            sizes={`${size}px`}
            className="size-full object-contain"
            onError={() => setFailedKey(imageKey)}
          />
        )}
      </span>
      {showIllustration && failedKey !== imageKey && imageKind === "illustration" && (
        <IllustrationNotice compact={compact} />
      )}
    </span>
  );
}
