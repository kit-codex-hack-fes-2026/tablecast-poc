import type { ReactNode } from "react";
import { ImageOff, Plus } from "lucide-react";
import { cn } from "tailwind-variants";
import { useI18n } from "../i18n/locale";
import { IllustrationNotice } from "./illustration-notice";
import { Money } from "./money";
import { ProductImage } from "./product-image";
import { Button } from "./ui/button";

/** 商品選択と店舗側の対応付けで、同じ写真・名称・価格・販売状態を表示する。 */
export function ProductCard({
  name,
  title,
  price,
  available,
  imageKey,
  imageKind,
  onChoose,
  compact = false,
  imageSizes,
  children,
}: {
  available: boolean;
  children?: ReactNode;
  compact?: boolean;
  imageKey: null | string;
  imageKind: "illustration" | "photograph";
  imageSizes?: string;
  name: ReactNode;
  onChoose?: () => void;
  price: number;
  title?: string;
}) {
  const { t } = useI18n();
  const className = cn(
    "flex h-full min-w-0 flex-col items-stretch justify-start gap-0 rounded-3xl border border-border bg-card bg-none p-3 text-left shadow-none disabled:opacity-70",
    compact && "h-auto w-44 max-w-full shrink-0 snap-start whitespace-normal rounded-xl p-2",
  );
  const content = (
    <>
      <ProductCardImage
        imageKey={imageKey}
        imageKind={imageKind}
        compact={compact}
        imageSizes={imageSizes}
        selectable={!!onChoose}
      />
      <span
        className={cn("flex flex-col px-1 pt-4 pb-1", !children && "flex-1", compact && "pt-2")}
      >
        {!available && (
          <span className="mb-2 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            <span className="rounded-sm bg-muted px-1.5 py-1 font-medium text-foreground">
              {t("kiosk_sold_out")}
            </span>
          </span>
        )}
        <span
          role={onChoose ? undefined : "heading"}
          aria-level={onChoose ? undefined : 3}
          title={title ?? (typeof name === "string" ? name : undefined)}
          className={cn(
            "block min-h-12 flex-1 text-base leading-6 font-semibold wrap-anywhere",
            compact && "min-h-10 text-sm leading-5",
          )}
        >
          {name}
        </span>
        <span
          className={cn(
            "mt-3 flex items-center justify-between gap-2 text-base font-semibold tabular-nums",
            compact && "mt-2 text-sm",
          )}
        >
          <Money taxIncluded value={price} wrap={compact} />
        </span>
      </span>
    </>
  );
  return onChoose ? (
    <Button
      variant="outline"
      type="button"
      className={className}
      data-theme-part="product-card"
      onClick={onChoose}
      disabled={!available}
    >
      {content}
    </Button>
  ) : (
    <article className={className} data-theme-part="product-card">
      {content}
      {children && <div className="mt-4 space-y-4 px-1">{children}</div>}
    </article>
  );
}

function ProductCardImage({
  imageKey,
  imageKind,
  compact,
  imageSizes,
  selectable,
}: {
  compact: boolean;
  imageKey: null | string;
  imageKind: "illustration" | "photograph";
  imageSizes?: string;
  selectable: boolean;
}) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "relative flex aspect-square w-full [content-visibility:auto] self-center items-center justify-center overflow-hidden rounded-xl bg-muted",
        compact && "h-24 aspect-auto",
      )}
    >
      {imageKey ? (
        <ProductImage
          responsive
          className="size-full object-contain"
          width={384}
          height={384}
          sizes={compact ? "156px" : (imageSizes ?? "(min-width: 48rem) 384px, calc(100vw - 56px)")}
          src={`/media/${imageKey}`}
          alt=""
        />
      ) : (
        <span className="flex flex-col items-center gap-1.5 text-sm text-muted-foreground">
          <ImageOff size={26} strokeWidth={1} aria-hidden="true" />
          {t("kiosk_no_image")}
        </span>
      )}
      {imageKey && imageKind === "illustration" && <IllustrationNotice />}
      {selectable && (
        <span
          className="absolute right-2 bottom-2 flex size-7 items-center justify-center rounded-full bg-card/90"
          aria-hidden="true"
        >
          <Plus size={16} />
        </span>
      )}
    </span>
  );
}
