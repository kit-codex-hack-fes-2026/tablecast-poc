import type { Catalog, Product } from "@tablecast/api/schema";
import { ImageOff, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { money, useI18n } from "../../i18n/locale";

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
  const products = catalog.configuration.products.filter((product) =>
    productIds
      ? productIds.includes(product.id)
      : category === "all" || product.categoryId === category,
  );
  return (
    <>
      {!productIds && (
        <fieldset
          className="flex gap-1.5 overflow-x-auto pt-3.5 px-4 pb-3 [scrollbar-width:none]"
          aria-label={t("kiosk_menu")}
        >
          <Button
            className="shrink-0 min-h-10 py-2 px-3 border border-border rounded-md text-xs whitespace-nowrap [&[aria-pressed='true']]:border-primary [&[aria-pressed='true']]:bg-primary [&[aria-pressed='true']]:text-card"
            variant="ghost"
            type="button"
            aria-pressed={category === "all"}
            onClick={() => setCategory("all")}
          >
            {t("kiosk_all")}
          </Button>
          {catalog.configuration.categories.map((item) => (
            <Button
              className="shrink-0 min-h-10 py-2 px-3 border border-border rounded-md text-xs whitespace-nowrap [&[aria-pressed='true']]:border-primary [&[aria-pressed='true']]:bg-primary [&[aria-pressed='true']]:text-card"
              variant="ghost"
              type="button"
              key={item.id}
              aria-pressed={category === item.id}
              onClick={() => setCategory(item.id)}
            >
              {item.text[locale].displayName}
            </Button>
          ))}
        </fieldset>
      )}
      <div
        className={
          productIds
            ? "grid grid-cols-2 gap-3"
            : "grid grid-cols-2 gap-y-4 gap-x-3 pt-0 px-4 pb-5 2xl:grid-cols-3"
        }
      >
        {products.map((product) => (
          <Button
            variant="ghost"
            type="button"
            className="flex rounded-md min-w-0 [&:disabled]:opacity-65 [&:hover:not(:disabled)_img]:scale-105 h-auto flex-col items-stretch justify-start whitespace-normal p-0 text-left"
            key={product.id}
            onClick={() => onChoose(product)}
            disabled={!product.available}
          >
            <span className="w-full aspect-3/2 overflow-hidden rounded-md bg-muted relative flex items-center justify-center [&_img]:w-full [&_img]:h-full [&_img]:object-cover [&_img]:transition-transform [&_img]:duration-200 [&_img]:ease-in-out">
              {product.imageKey ? (
                <img src={`/media/${product.imageKey}`} alt="" loading="lazy" />
              ) : (
                <span className="text-muted-foreground flex flex-col items-center gap-1.5">
                  <ImageOff size={26} strokeWidth={1} aria-hidden="true" />
                  <small className="text-xs">{t("kiosk_no_image")}</small>
                </span>
              )}
              {!product.available && (
                <span className="absolute top-auto inset-x-2 bottom-2 bg-card/90 py-1 px-1.5 text-xs rounded-sm text-center">
                  {t("kiosk_sold_out")}
                </span>
              )}
              {product.imageKey && product.imageKind === "illustration" && (
                <span className="absolute left-1.5 bottom-1 py-px px-1 rounded-sm text-xs bg-card/90 text-muted-foreground">
                  {t("kiosk_illustration")}
                </span>
              )}
            </span>
            <span className="flex flex-col flex-1 pt-2.5 px-0 pb-0">
              <strong className="block text-xs leading-relaxed font-medium flex-1 2xl:text-sm">
                {product.text[locale].displayName}
              </strong>
              <span className="flex items-center justify-between gap-1 text-xs font-semibold mt-1">
                {money(product.price, locale)}
                <span
                  className="flex items-center justify-center w-7 h-7 rounded-full bg-muted"
                  aria-hidden="true"
                >
                  <Plus size={16} />
                </span>
              </span>
            </span>
          </Button>
        ))}
      </div>
    </>
  );
}
