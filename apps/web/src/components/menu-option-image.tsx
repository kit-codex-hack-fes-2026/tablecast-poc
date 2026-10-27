import type { Modifier } from "@tablecast/api/schema";
import { ImageOff } from "lucide-react";
import { useState } from "react";
import { IllustrationNotice } from "./illustration-notice";
import { ProductImage } from "./product-image";

export function MenuOptionImage({
  imageKey,
  imageKind,
  compact = false,
}: Pick<Modifier["options"][number], "imageKey" | "imageKind"> & { compact?: boolean }) {
  const [failedKey, setFailedKey] = useState<null | string>(null);
  if (!imageKey) return null;
  return (
    <span className={`relative flex shrink-0 ${compact ? "w-12" : "w-24"}`}>
      <span
        ref={(frame) => {
          const image = frame?.querySelector("img");
          if (image?.currentSrc && image.complete && image.naturalWidth === 0)
            setFailedKey(imageKey);
        }}
        aria-hidden="true"
        className={`flex items-center justify-center overflow-hidden rounded-lg bg-muted ${compact ? "size-12" : "size-24"}`}
      >
        {failedKey === imageKey ? (
          <ImageOff className="size-6 text-muted-foreground" />
        ) : (
          <ProductImage
            src={`/media/${imageKey}`}
            alt=""
            width={compact ? 48 : 96}
            height={compact ? 48 : 96}
            sizes={compact ? "48px" : "96px"}
            className="size-full object-contain"
            onError={() => setFailedKey(imageKey)}
          />
        )}
      </span>
      {failedKey !== imageKey && imageKind === "illustration" && (
        <IllustrationNotice compact={compact} />
      )}
    </span>
  );
}
