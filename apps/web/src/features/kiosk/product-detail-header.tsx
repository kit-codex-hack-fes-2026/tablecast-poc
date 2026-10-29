import type { Product } from "@tablecast/api/schema";
import { resolveText } from "@tablecast/api/localization";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ProductFoodQuery } from "./product-food-query";
import { Money } from "../../components/money";
import { ProductImage } from "../../components/product-image";
import { ProductImageTransition } from "../../components/product-image-transition";
import { ProductName } from "../../components/product-name";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { ProductAllergens } from "./product-allergens";

export function ProductDetailHeader({
  product,
  imageTransition,
  imageSize,
  busy,
  onClose,
  food,
}: {
  busy: boolean;
  food?: ProductFoodQuery;
  imageSize: number;
  imageTransition: boolean;
  onClose: () => void;
  product: Product;
}) {
  const { locale, t } = useI18n();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div
      data-ui="product-detail-header"
      className={`grid shrink-0 items-start gap-x-3 gap-y-4 rounded-t-3xl bg-card p-3 pb-1 @min-[36rem]/product-dialog:gap-x-5 @min-[36rem]/product-dialog:p-4 ${product.imageKey ? "grid-cols-[4rem_minmax(0,1fr)_auto] @min-[36rem]/product-dialog:grid-cols-[10rem_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto]"}`}
    >
      {product.imageKey && (
        <ProductImageTransition
          enabled={imageTransition}
          productId={product.id}
          radius={8}
          className="col-start-1 row-start-1 size-16 overflow-hidden bg-muted @min-[36rem]/product-dialog:row-span-2 @min-[36rem]/product-dialog:size-40"
        >
          <ProductImage
            priority
            width={160}
            height={160}
            sizes={`${imageSize}px`}
            className="size-full object-contain"
            src={`/media/${product.imageKey}`}
            alt={resolveText(product.text, locale).displayName}
          />
        </ProductImageTransition>
      )}
      <div
        className={`min-w-0 ${product.imageKey ? "col-start-2 row-start-1" : "col-start-1 row-start-1"}`}
      >
        <h2
          ref={heading}
          tabIndex={-1}
          className="text-base font-semibold outline-none @min-[36rem]/product-dialog:text-lg"
        >
          <ProductName text={product.text} />
        </h2>
        <div data-ui="product-detail-price" className="mt-1 text-lg font-semibold">
          <Money taxIncluded value={product.price} />
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className={`row-start-1 justify-self-end @max-[36rem]/product-dialog:size-11 @max-[36rem]/product-dialog:p-0 ${product.imageKey ? "col-start-3" : "col-start-2"}`}
        onClick={onClose}
        disabled={busy}
      >
        <X />
        <span className="sr-only @min-[36rem]/product-dialog:not-sr-only">{t("common_close")}</span>
      </Button>
      {food && (
        <div
          className={`col-span-full min-w-0 @min-[36rem]/product-dialog:col-span-1 @min-[36rem]/product-dialog:row-start-2 ${product.imageKey ? "@min-[36rem]/product-dialog:col-start-2" : "@min-[36rem]/product-dialog:col-start-1"}`}
        >
          <ProductAllergens query={food} />
        </div>
      )}
    </div>
  );
}
