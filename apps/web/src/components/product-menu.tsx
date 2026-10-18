import type { Catalog, MenuSection, Product } from "@tablecast/api/schema";
import { ArrowUpRight, ImageOff } from "lucide-react";
import { useState } from "react";
import { tv } from "tailwind-variants";
import { money } from "../i18n/format";
import { useI18n } from "../i18n/locale";
import { MenuBanners } from "./menu-banners";
import { menuSections } from "./menu-composition";
import { ProductImage } from "./product-image";
import { StoreLogo } from "./store-logo";
import { Button } from "./ui/button";

const dishes = tv({
  base: "grid min-w-0",
  variants: {
    layout: {
      list: "grid-cols-1 divide-y divide-border/60 @3xl/tablecast-menu:grid-cols-2 @3xl/tablecast-menu:gap-x-10",
      gallery: "grid-cols-1 gap-5 @sm/tablecast-menu:grid-cols-2 @3xl/tablecast-menu:grid-cols-3",
      feature: "grid-cols-1 gap-6 @xl/tablecast-menu:grid-cols-2",
    },
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
  const [category, setCategory] = useState<string | null>(null);
  const configuration = catalog.configuration;
  const selected = new Set(productIds);
  const products = configuration.products.filter((product) =>
    productIds
      ? selected.has(product.id)
      : category === null || category === "all" || product.categoryId === category,
  );
  return (
    <div className="@container/tablecast-menu min-w-0">
      {!productIds && (
        <fieldset
          className="sticky top-0 z-10 flex gap-2 overflow-x-auto border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur-lg sm:px-6"
          aria-label={t("kiosk_menu")}
        >
          {[
            { id: null, label: t("kiosk_menu_artwork") },
            { id: "all", label: t("kiosk_all") },
            ...configuration.categories.map((item) => ({
              id: item.id,
              label: item.text[locale].displayName,
            })),
          ].map((item) => (
            <Button
              key={item.id ?? "composition"}
              type="button"
              variant="ghost"
              size="lg"
              data-theme-part="category-button"
              aria-pressed={category === item.id}
              className="max-w-full shrink-0 rounded-full px-4 aria-pressed:bg-primary aria-pressed:text-primary-foreground"
              onClick={() => setCategory(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </fieldset>
      )}
      {!productIds && category === null ? (
        <div className="space-y-2 pb-10">
          {!configuration.appearance?.sections?.length && (
            <MenuBanners catalog={catalog} onChoose={onChoose} />
          )}
          {menuSections(configuration)
            .filter(
              (section) => configuration.appearance?.sections?.length || section.kind !== "artwork",
            )
            .map((section) => (
              <MenuSpread
                key={section.id}
                section={section}
                catalog={catalog}
                onChoose={onChoose}
              />
            ))}
          {configuration.products.length === 0 && (
            <p role="status" className="px-6 py-12 text-center text-muted-foreground">
              {t("kiosk_menu_empty")}
            </p>
          )}
        </div>
      ) : (
        <div className={productIds ? "" : "p-4 sm:px-6"}>
          {products.length ? (
            <DishList products={products} onChoose={onChoose} />
          ) : (
            <p role="status" className="py-12 text-center text-muted-foreground">
              {t("kiosk_category_empty")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function sectionProducts(
  products: Product[],
  source?: Extract<MenuSection, { kind: "products" }>["source"],
) {
  if (!source || source.kind === "all") return products;
  if (source.kind === "category")
    return products.filter((product) => product.categoryId === source.categoryId);
  const selected = new Set(source.productIds);
  return products.filter((product) => selected.has(product.id));
}

function spreadContent(
  catalog: Catalog,
  section: MenuSection,
  locale: "ja" | "en",
  introduction: string,
) {
  const configuration = catalog.configuration;
  const source = section.kind === "products" ? section.source : undefined;
  const category =
    source?.kind === "category"
      ? configuration.categories.find((item) => item.id === source.categoryId)
      : undefined;
  return {
    source,
    align:
      section.align ??
      (section.kind === "intro"
        ? configuration.appearance?.composition?.masthead?.align
        : undefined) ??
      "start",
    title:
      section.title?.[locale] ||
      (section.kind === "intro"
        ? (configuration.storeName ?? catalog.storeName)
        : category?.text[locale].displayName),
    body: section.body?.[locale] || (section.kind === "intro" ? introduction : undefined),
    asset:
      (section.kind === "intro" || section.kind === "story") && section.imageAsset
        ? configuration.appearance?.assets?.[section.imageAsset]
        : undefined,
  };
}

function LegacyMasthead({ configuration }: { configuration: Catalog["configuration"] }) {
  const masthead = configuration.appearance?.composition?.masthead;
  return masthead?.visible ? (
    <StoreLogo
      logo={configuration.branding?.logo}
      width={masthead.logoWidth}
      height={masthead.logoHeight}
    />
  ) : null;
}

function MenuSpread({
  section,
  catalog,
  onChoose,
}: {
  section: MenuSection;
  catalog: Catalog;
  onChoose: (product: Product) => void;
}) {
  const { locale, t } = useI18n();
  const configuration = catalog.configuration;
  const { source, title, body, asset, align } = spreadContent(
    catalog,
    section,
    locale,
    t("kiosk_menu_intro"),
  );
  const products = sectionProducts(configuration.products, source);
  if (section.kind === "products" && !products.length) return null;
  return (
    <section
      data-theme-part={section.kind === "intro" ? "menu-masthead" : "menu-section"}
      data-theme-section={section.id}
      data-align={align}
      data-spacing={section.spacing ?? "comfortable"}
      className="mx-4 px-2 py-6 data-[align=center]:text-center data-[spacing=compact]:py-3 sm:mx-6 sm:px-4 sm:py-7"
    >
      {section.kind === "intro" && <LegacyMasthead configuration={configuration} />}
      {(title || body) && (
        <header className="mb-5 last:mb-0">
          {title && (
            <h2
              className={
                section.kind === "intro"
                  ? "text-3xl font-medium tracking-tight sm:text-4xl"
                  : "text-2xl font-medium tracking-tight"
              }
            >
              {title}
            </h2>
          )}
          {body && (
            <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-muted-foreground">
              {body}
            </p>
          )}
        </header>
      )}
      {asset && (
        <figure className="mb-6">
          <ProductImage
            src={`/media/${asset.imageKey}`}
            alt={asset.alt[locale]}
            width={1200}
            height={600}
            sizes="100vw"
            className="h-auto max-h-120 w-full rounded-lg object-contain"
          />
          {asset.imageKind === "illustration" && (
            <figcaption className="mt-2 text-xs text-muted-foreground">
              {t("kiosk_illustration")}
            </figcaption>
          )}
        </figure>
      )}
      {section.kind === "products" && (
        <DishList products={products} layout={section.layout} onChoose={onChoose} />
      )}
      {section.kind === "artwork" && (
        <MenuBanners catalog={catalog} bannerId={section.bannerId} onChoose={onChoose} />
      )}
    </section>
  );
}

function DishList({
  products,
  layout = "list",
  onChoose,
}: {
  products: Product[];
  layout?: "list" | "gallery" | "feature";
  onChoose: (product: Product) => void;
}) {
  const { locale, t } = useI18n();
  return (
    <div className={dishes({ layout })}>
      {products.map((product) => (
        <Button
          key={product.id}
          variant="ghost"
          type="button"
          data-theme-part="product-card"
          data-layout={layout}
          className="group/dish h-full min-w-0 items-stretch justify-start gap-4 rounded-lg py-5 text-left data-[layout=gallery]:flex-col data-[layout=feature]:flex-col disabled:opacity-70"
          onClick={() => onChoose(product)}
          disabled={!product.available}
        >
          <span className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/50 group-data-[layout=gallery]/dish:aspect-4/3 group-data-[layout=gallery]/dish:h-auto group-data-[layout=gallery]/dish:w-full group-data-[layout=feature]/dish:aspect-3/2 group-data-[layout=feature]/dish:h-auto group-data-[layout=feature]/dish:w-full @md/tablecast-menu:size-28">
            {product.imageKey ? (
              <ProductImage
                className="size-full object-contain"
                width={512}
                height={384}
                sizes={layout === "list" ? "112px" : "(min-width: 900px) 33vw, 90vw"}
                src={`/media/${product.imageKey}`}
                alt=""
              />
            ) : (
              <span className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
                <ImageOff size={24} strokeWidth={1} aria-hidden="true" />
                {t("kiosk_no_image")}
              </span>
            )}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-2">
            <strong className="text-base leading-snug font-semibold wrap-anywhere">
              {product.text[locale].displayName}
            </strong>
            {product.text[locale].description && (
              <span className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                {product.text[locale].description}
              </span>
            )}
            {(!product.available || (product.imageKey && product.imageKind === "illustration")) && (
              <span className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {!product.available && (
                  <span className="font-semibold text-foreground">{t("kiosk_sold_out")}</span>
                )}
                {product.imageKey && product.imageKind === "illustration" && (
                  <span>{t("kiosk_illustration")}</span>
                )}
              </span>
            )}
            <span className="mt-auto flex items-center justify-between gap-2 pt-2 font-semibold tabular-nums">
              {money(product.price, locale)}
              <span
                className="flex size-8 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors group-hover/dish:bg-primary group-hover/dish:text-primary-foreground group-disabled/dish:hidden"
                aria-hidden="true"
              >
                <ArrowUpRight size={16} />
              </span>
            </span>
          </span>
        </Button>
      ))}
    </div>
  );
}
