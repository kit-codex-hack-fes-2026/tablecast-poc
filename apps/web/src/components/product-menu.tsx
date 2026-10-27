import type { Catalog, Product } from "@tablecast/api/schema";
import { ImageOff, Plus } from "lucide-react";
import { memo, useState } from "react";
import { tv } from "tailwind-variants";
import { useI18n } from "../i18n/locale";
import { IllustrationNotice } from "./illustration-notice";
import { MenuBanners } from "./menu-banners";
import { Money } from "./money";
import { ProductImage } from "./product-image";
import { StoreLogo } from "./store-logo";
import { Button } from "./ui/button";

const productGrid = tv({
  base: "grid grid-cols-1 @xs/tablecast-menu:grid-cols-2 @2xl/tablecast-menu:grid-cols-3",
  variants: {
    recommended: { true: "gap-3", false: "gap-4 px-4 pb-4" },
  },
});

/**
 * カテゴリと商品を選ぶ既存メニュー。
 * catalogとonChoose(product)が必須。
 * 任意のproductIdsで提示対象を絞る。
 * 商品名・価格・売切をAPIから表示し、選んだ商品はfeatureのカスタマイズへ進める。
 * 店舗の自由な画像案内はMenuBannersで補う。
 */
export const ProductMenu = memo(function ProductMenu({
  catalog,
  onChoose,
  productIds,
}: {
  catalog: Catalog;
  onChoose: (product: Product) => void;
  productIds?: string[];
}) {
  const { locale, t } = useI18n();
  const [category, setCategory] = useState("all");
  const selectedIds = new Set(productIds);
  const masthead = catalog.configuration.appearance?.composition?.masthead;
  const products = catalog.configuration.products.filter((product) =>
    productIds
      ? selectedIds.has(product.id)
      : category === "all" || product.categoryId === category,
  );
  return (
    <div className="@container/tablecast-menu min-w-0">
      {!productIds && masthead?.visible && (
        <div
          data-theme-part="menu-masthead"
          className="flex flex-col gap-2 mx-4 mt-3"
          style={{
            padding: masthead.padding,
            alignItems: masthead.align === "center" ? "center" : "flex-start",
          }}
        >
          <StoreLogo
            logo={catalog.configuration.branding?.logo}
            width={masthead.logoWidth}
            height={masthead.logoHeight}
          />
          <h2 className="text-base font-semibold">
            {catalog.configuration.storeName ?? catalog.storeName}
          </h2>
        </div>
      )}
      {!productIds && <MenuBanners catalog={catalog} onChoose={onChoose} />}
      {!productIds && (
        <fieldset className="flex gap-2 overflow-x-auto p-4" aria-label={t("kiosk_menu")}>
          <Button
            className="max-w-full shrink-0 border-border px-4 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            variant="outline"
            size="lg"
            type="button"
            data-theme-part="category-button"
            aria-pressed={category === "all"}
            onClick={() => setCategory("all")}
          >
            {t("kiosk_all")}
          </Button>
          {catalog.configuration.categories.map((item) => (
            <Button
              className="max-w-full shrink-0 border-border px-4 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
              variant="outline"
              size="lg"
              type="button"
              key={item.id}
              data-theme-part="category-button"
              aria-pressed={category === item.id}
              onClick={() => setCategory(item.id)}
            >
              {item.text[locale].displayName}
            </Button>
          ))}
        </fieldset>
      )}
      {!productIds && products.length === 0 && (
        <p role="status" className="py-12 px-6 text-muted-foreground text-center">
          {t(
            catalog.configuration.products.length === 0
              ? "kiosk_menu_empty"
              : "kiosk_category_empty",
          )}
        </p>
      )}
      <div className={productGrid({ recommended: Boolean(productIds) })}>
        {products.map((product) => (
          <Button
            variant="outline"
            type="button"
            className="h-full min-w-0 flex-col items-stretch justify-start gap-0 rounded-2xl border-border bg-card bg-none p-2 text-left shadow-none disabled:opacity-70"
            data-theme-part="product-card"
            key={product.id}
            onClick={() => onChoose(product)}
            disabled={!product.available}
          >
            <span className="relative flex aspect-square w-full [content-visibility:auto] self-center items-center justify-center overflow-hidden rounded-lg bg-muted">
              {product.imageKey ? (
                <ProductImage
                  className="size-full object-contain"
                  width={384}
                  height={384}
                  sizes="(min-width: 1536px) 17vw, (min-width: 640px) 25vw, 50vw"
                  src={`/media/${product.imageKey}`}
                  alt=""
                />
              ) : (
                <span className="flex flex-col items-center gap-1.5 text-sm text-muted-foreground">
                  <ImageOff size={26} strokeWidth={1} aria-hidden="true" />
                  {t("kiosk_no_image")}
                </span>
              )}
              {product.imageKey && product.imageKind === "illustration" && <IllustrationNotice />}
            </span>
            <span className="flex flex-1 flex-col pt-3">
              {!product.available && (
                <span className="mb-2 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                  {!product.available && (
                    <span className="rounded-sm bg-muted px-1.5 py-1 font-medium text-foreground">
                      {t("kiosk_sold_out")}
                    </span>
                  )}
                </span>
              )}
              <strong className="block min-h-12 flex-1 text-base leading-snug font-semibold wrap-anywhere">
                {product.text[locale].displayName}
              </strong>
              <span className="mt-3 flex items-center justify-between gap-2 text-base font-semibold tabular-nums">
                <Money taxIncluded value={product.price} />
                <span
                  className="flex items-center justify-center rounded-full bg-muted size-7"
                  aria-hidden="true"
                >
                  <Plus size={16} />
                </span>
              </span>
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
});
