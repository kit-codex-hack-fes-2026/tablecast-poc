import type { Modifier } from "@tablecast/api/schema";
import { ImageOff } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../i18n/locale";
import { ProductImage } from "./product-image";

export function MenuOptionImage({
  imageKey,
  imageKind,
}: Pick<Modifier["options"][number], "imageKey" | "imageKind">) {
  const { t } = useI18n();
  const [failedKey, setFailedKey] = useState<string | null>(null);
  if (!imageKey) return null;
  return (
    <span className="flex w-24 shrink-0 flex-col gap-1">
      <span
        ref={(frame) => {
          const image = frame?.querySelector("img");
          if (image?.complete && image.naturalWidth === 0) setFailedKey(imageKey);
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
      {failedKey !== imageKey && imageKind === "illustration" && (
        <span className="text-center text-xs text-balance text-muted-foreground">
          {t("kiosk_illustration")}
        </span>
      )}
    </span>
  );
}
