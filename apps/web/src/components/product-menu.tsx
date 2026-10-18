import { MenuBanners } from "./menu-banners";
import { StoreLogo } from "./store-logo";
import { tv } from "tailwind-variants";
import type { Catalog, Product } from "@tablecast/api/schema";
import { ImageOff, Plus } from "lucide-react";
import { useState } from "react";
import { ProductImage } from "./product-image";
import { Button } from "./ui/button";
import { money } from "../i18n/format";
import { useI18n } from "../i18n/locale";

const productGrid = tv({
  base: "grid grid-cols-1 @xs/tablecast-menu:grid-cols-2 @2xl/tablecast-menu:grid-cols-3",
  variants: {
    recommended: { true: "gap-3", false: "gap-y-5 gap-x-4 px-4 pb-5" },
  },
});

export function ProductMenu({
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
            variant="ghost"
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
              variant="ghost"
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
            variant="ghost"
            type="button"
            className="h-full min-w-0 flex-col items-stretch justify-start gap-0 rounded-xl p-2 text-left disabled:opacity-70"
            data-theme-part="product-card"
            key={product.id}
            onClick={() => onChoose(product)}
            disabled={!product.available}
          >
            <span className="flex aspect-square w-full max-w-64 self-center items-center justify-center overflow-hidden rounded-md bg-muted">
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
            </span>
            <span className="flex flex-1 flex-col pt-3">
              {(!product.available ||
                (product.imageKey && product.imageKind === "illustration")) && (
                <span className="mb-2 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                  {!product.available && (
                    <span className="rounded-sm bg-muted px-1.5 py-1 font-medium text-foreground">
                      {t("kiosk_sold_out")}
                    </span>
                  )}
                  {product.imageKey && product.imageKind === "illustration" && (
                    <span>{t("kiosk_illustration")}</span>
                  )}
                </span>
              )}
              <strong className="block flex-1 text-base leading-snug font-semibold wrap-anywhere">
                {product.text[locale].displayName}
              </strong>
              <span className="mt-3 flex items-center justify-between gap-2 text-base font-semibold tabular-nums">
                {money(product.price, locale)}
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
}
