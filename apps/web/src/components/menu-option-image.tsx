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
}: Pick<Modifier["options"][number], "imageKey" | "imageKind"> & {
  compact?: boolean;
  showIllustration?: boolean;
}) {
  const [failedKey, setFailedKey] = useState<null | string>(null);
  if (!imageKey) return null;
  return (
    <span className={`relative flex shrink-0 ${compact ? "w-8" : "w-24"}`}>
      <span
        ref={(frame) => {
          const image = frame?.querySelector("img");
          if (image?.currentSrc && image.complete && image.naturalWidth === 0)
            setFailedKey(imageKey);
        }}
        aria-hidden="true"
        className={`flex items-center justify-center overflow-hidden rounded-lg bg-muted ${compact ? "size-8" : "size-24"}`}
      >
        {failedKey === imageKey ? (
          <ImageOff className="size-6 text-muted-foreground" />
        ) : (
          <ProductImage
            src={`/media/${imageKey}`}
            alt=""
            width={compact ? 32 : 96}
            height={compact ? 32 : 96}
            sizes={compact ? "32px" : "96px"}
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
