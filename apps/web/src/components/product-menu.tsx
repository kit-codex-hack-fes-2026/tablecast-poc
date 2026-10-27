import type { Catalog, Product } from "@tablecast/api/schema";
import { ImageOff, Plus } from "lucide-react";
import { memo, useState } from "react";
import { cn, tv } from "tailwind-variants";
import { useI18n } from "../i18n/locale";
import { IllustrationNotice } from "./illustration-notice";
import { MenuBanners } from "./menu-banners";
import { Money } from "./money";
import { ProductImage } from "./product-image";
import { StoreLogo } from "./store-logo";
import { Button } from "./ui/button";

const productGrid = tv({
  base: "grid grid-cols-1 @lg/tablecast-menu:grid-cols-2 @3xl/tablecast-menu:grid-cols-3",
  variants: {
    recommended: { true: "gap-3", false: "gap-6 px-4 pb-4" },
    compact: {
      true: "flex items-start overflow-x-auto overscroll-x-contain snap-x snap-proximity pb-2",
    },
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
  compact = false,
}: {
  catalog: Catalog;
  compact?: boolean;
  onChoose: (product: Product) => void;
  productIds?: string[];
}) {
  const { locale, t } = useI18n();
  const [category, setCategory] = useState("all");
  const masthead = catalog.configuration.appearance?.composition?.masthead;
  const byId = new Map(catalog.configuration.products.map((product) => [product.id, product]));
  const products = productIds
    ? [...new Set(productIds)].flatMap((id) => {
        const product = byId.get(id);
        return product ? [product] : [];
      })
    : catalog.configuration.products.filter(
        (product) => category === "all" || product.categoryId === category,
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
        <fieldset
          className="flex gap-2 overflow-x-auto px-4 pt-4 pb-6"
          aria-label={t("kiosk_menu")}
        >
          <Button
            className="shrink-0 whitespace-nowrap"
            variant={category === "all" ? "secondary" : "outline"}
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
              className="shrink-0 whitespace-nowrap"
              variant={category === item.id ? "secondary" : "outline"}
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
      <div
        data-ui={compact ? "conversation-products" : undefined}
        className={productGrid({ recommended: Boolean(productIds), compact })}
      >
        {products.map((product) => (
          <Button
            variant="outline"
            type="button"
            className={cn(
              "h-full min-w-0 flex-col items-stretch justify-start gap-0 rounded-3xl border-border bg-card bg-none p-3 text-left shadow-none disabled:opacity-70",
              compact &&
                "h-auto w-44 max-w-full shrink-0 snap-start whitespace-normal rounded-xl p-2",
            )}
            data-theme-part="product-card"
            key={product.id}
            onClick={() => onChoose(product)}
            disabled={!product.available}
          >
            <span
              className={cn(
                "relative flex aspect-square w-full [content-visibility:auto] self-center items-center justify-center overflow-hidden rounded-xl bg-muted",
                compact && "h-24 aspect-auto",
              )}
            >
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
              <span
                className="absolute right-2 bottom-2 flex size-7 items-center justify-center rounded-full bg-card/90"
                aria-hidden="true"
              >
                <Plus size={16} />
              </span>
            </span>
            <span className={cn("flex flex-1 flex-col px-1 pt-4 pb-1", compact && "pt-2")}>
              {!product.available && (
                <span className="mb-2 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                  {!product.available && (
                    <span className="rounded-sm bg-muted px-1.5 py-1 font-medium text-foreground">
                      {t("kiosk_sold_out")}
                    </span>
                  )}
                </span>
              )}
              <strong
                title={product.text[locale].displayName}
                className={cn(
                  "block min-h-12 flex-1 text-base leading-6 font-semibold wrap-anywhere",
                  compact && "line-clamp-2 min-h-10 text-sm leading-5",
                )}
              >
                {product.text[locale].displayName}
              </strong>
              <span
                className={cn(
                  "mt-3 flex items-center justify-between gap-2 text-base font-semibold tabular-nums",
                  compact && "mt-2 text-sm",
                )}
              >
                <Money taxIncluded value={product.price} />
              </span>
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
});
