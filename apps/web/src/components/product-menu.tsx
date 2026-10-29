import type { Catalog, Product } from "@tablecast/api/schema";
import { resolveText } from "@tablecast/api/localization";
import { Search } from "lucide-react";
import { memo, type RefObject, useState } from "react";
import { tv } from "tailwind-variants";
import { useI18n } from "../i18n/locale";
import { MenuBanners } from "./menu-banners";
import { ProductCard } from "./product-card";
import { ProductName } from "./product-name";
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
  category: controlledCategory,
  onCategoryChange,
  onSearch,
  searchButtonRef,
  searchResults = false,
  imageSizes,
}: {
  catalog: Catalog;
  category?: string;
  compact?: boolean;
  imageSizes?: string;
  onCategoryChange?: (category: string) => void;
  onChoose: (product: Product) => void;
  onSearch?: () => void;
  productIds?: string[];
  searchButtonRef?: RefObject<HTMLButtonElement | null>;
  searchResults?: boolean;
}) {
  const { locale, t } = useI18n();
  const [localCategory, setLocalCategory] = useState("all");
  const category = controlledCategory ?? localCategory;
  const setCategory = onCategoryChange ?? setLocalCategory;
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
        <MenuCategories
          catalog={catalog}
          category={category}
          onCategoryChange={setCategory}
          onSearch={onSearch}
          searchButtonRef={searchButtonRef}
        />
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
        className={productGrid({ recommended: Boolean(productIds) && !searchResults, compact })}
      >
        {products.map((product) => (
          <ProductCard
            key={product.id}
            name={<ProductName text={product.text} />}
            title={resolveText(product.text, locale).displayName}
            price={product.price}
            available={product.available}
            imageKey={product.imageKey}
            imageKind={product.imageKind}
            compact={compact}
            imageSizes={imageSizes}
            onChoose={() => onChoose(product)}
          />
        ))}
      </div>
    </div>
  );
});

function MenuCategories({
  catalog,
  category,
  onCategoryChange,
  onSearch,
  searchButtonRef,
}: {
  catalog: Catalog;
  category: string;
  onCategoryChange: (category: string) => void;
  onSearch?: () => void;
  searchButtonRef?: RefObject<HTMLButtonElement | null>;
}) {
  const { locale, t } = useI18n();
  return (
    <div className="flex gap-2 px-4 pt-4 pb-6">
      {onSearch && (
        <Button
          ref={searchButtonRef}
          className="shrink-0"
          variant="outline"
          size="lg"
          type="button"
          onClick={onSearch}
        >
          <Search size={20} aria-hidden="true" />
          {t("kiosk_menu_search")}
        </Button>
      )}
      <fieldset className="flex min-w-0 gap-2 overflow-x-auto" aria-label={t("kiosk_menu")}>
        <Button
          className="shrink-0 whitespace-nowrap"
          variant={category === "all" ? "secondary" : "outline"}
          size="lg"
          type="button"
          data-theme-part="category-button"
          aria-pressed={category === "all"}
          onClick={() => onCategoryChange("all")}
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
            onClick={() => onCategoryChange(item.id)}
          >
            {resolveText(item.text, locale).displayName}
          </Button>
        ))}
      </fieldset>
    </div>
  );
}
