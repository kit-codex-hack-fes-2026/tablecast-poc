import type { Modifier } from "@tablecast/api/schema";
import { ImageOff } from "lucide-react";
import { useState } from "react";
import { IllustrationNotice } from "./illustration-notice";
import { ProductImage } from "./product-image";

export function MenuOptionImage({
  imageKey,
  imageKind,
}: Pick<Modifier["options"][number], "imageKey" | "imageKind">) {
  const [failedKey, setFailedKey] = useState<null | string>(null);
  if (!imageKey) return null;
  return (
    <span className="relative flex w-24 shrink-0">
      <span
        ref={(frame) => {
          const image = frame?.querySelector("img");
          if (image?.currentSrc && image.complete && image.naturalWidth === 0)
            setFailedKey(imageKey);
        }}
        aria-hidden="true"
        className="flex size-24 items-center justify-center overflow-hidden rounded-lg bg-muted"
      >
        {failedKey === imageKey ? (
          <ImageOff className="size-6 text-muted-foreground" />
        ) : (
          <ProductImage
            src={`/media/${imageKey}`}
            alt=""
            width={96}
            height={96}
            sizes="96px"
            className="size-full object-contain"
            onError={() => setFailedKey(imageKey)}
          />
        )}
      </span>
      {failedKey !== imageKey && imageKind === "illustration" && <IllustrationNotice />}
    </span>
  );
}
