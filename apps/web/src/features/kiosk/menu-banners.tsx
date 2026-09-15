import type { Catalog, Product } from "@tablecast/api/schema";
import { useState } from "react";
import { useI18n } from "../../i18n/locale";
import { Button } from "../../components/ui/button";
import { tv } from "tailwind-variants";
const bannerGrid = tv({
  base: "grid",
  variants: { columns: { 1: "grid-cols-1", 2: "grid-cols-1 @sm:grid-cols-2" } },
});
export function MenuBanners({
  catalog,
  onChoose,
}: {
  catalog: Catalog;
  onChoose: (product: Product) => void;
}) {
  const { locale, t } = useI18n();
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const layout = catalog.configuration.appearance?.composition?.banners;
  if (!catalog.configuration.banners?.some((banner) => banner.enabled)) return null;
  return (
    <div className="@container px-4 pt-3">
      <div
        className={bannerGrid({ columns: layout?.columns ?? 1 })}
        style={{ gap: layout?.gap ?? 12 }}
      >
        {catalog.configuration.banners?.map((banner) =>
          banner.enabled ? (
            <figure
              key={banner.id}
              data-theme-part="banner"
              className="min-w-0 overflow-hidden"
              style={{ gridColumn: banner.span === "full" ? "1 / -1" : undefined }}
            >
              {!failed.has(banner.image.imageKey) && (
                <div className="relative w-full">
                  <img
                    src={`/media/${banner.image.imageKey}?width=1600`}
                    alt={banner.image.alt[locale]}
                    className="block h-auto w-full"
                    onError={() => setFailed((keys) => new Set([...keys, banner.image.imageKey]))}
                  />
                  {banner.hotspots.map((spot) => {
                    const product = catalog.configuration.products.find(
                      (item) => item.id === spot.productId,
                    );
                    if (!product) return null;
                    return (
                      <button
                        key={spot.id}
                        type="button"
                        aria-label={product.text[locale].displayName}
                        disabled={!product.available}
                        onClick={() => onChoose(product)}
                        className="group absolute rounded-sm border-2 border-transparent hover:border-primary focus-visible:border-primary focus-visible:bg-card/30"
                        style={{
                          left: `${spot.rect.x * 100}%`,
                          top: `${spot.rect.y * 100}%`,
                          width: `${spot.rect.width * 100}%`,
                          height: `${spot.rect.height * 100}%`,
                        }}
                      >
                        <span
                          aria-hidden
                          className="pointer-events-none absolute left-0 top-0 max-w-full rounded bg-card px-2 py-1 text-xs text-foreground opacity-0 group-focus-visible:opacity-100"
                        >
                          {product.text[locale].displayName}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <figcaption className="flex flex-wrap gap-2 py-2">
                {banner.image.imageKind === "illustration" && (
                  <small>{t("kiosk_illustration")}</small>
                )}
                {[...new Set(banner.hotspots.map((spot) => spot.productId))].map((id) => {
                  const product = catalog.configuration.products.find((item) => item.id === id);
                  return product ? (
                    <Button
                      key={id}
                      variant="outline"
                      disabled={!product.available}
                      onClick={() => onChoose(product)}
                    >
                      {product.text[locale].displayName}
                      {!product.available && ` · ${t("kiosk_sold_out")}`}
                    </Button>
                  ) : null;
                })}
              </figcaption>
            </figure>
          ) : null,
        )}
      </div>
    </div>
  );
}
