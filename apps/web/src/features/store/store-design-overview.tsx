import type { Catalog } from "@tablecast/api/schema";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { StoreTheme } from "../../components/store-theme";
import { useI18n } from "../../i18n/locale";
import { ProductMenu } from "../../components/product-menu";
import { StoreLogo } from "../../components/store-logo";
import { Brand } from "../../components/brand";
import { menuListSearchSchema } from "./menu-model";

export function StoreDesignOverview({ catalog }: { catalog: Catalog }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const search = menuListSearchSchema.parse(useSearch({ strict: false }));
  const { configuration } = catalog;
  const summary = [
    ["theme_product_count", configuration.products.length],
    ["theme_banner_count", configuration.banners?.filter((banner) => banner.enabled).length ?? 0],
    ["theme_asset_count", Object.keys(configuration.appearance?.assets ?? {}).length],
  ] as const;
  return (
    <div className="grid min-w-0 items-start gap-8 xl:grid-cols-[minmax(0,1fr)_16rem]">
      <section className="min-w-0 space-y-3" aria-label={t("theme_published_overview")}>
        <h2 className="text-lg font-semibold">{t("theme_published_overview")}</h2>
        <p className="text-sm text-muted-foreground">{t("theme_preview_navigation")}</p>
        <div className="overflow-hidden rounded-xl border border-border">
          <StoreTheme appearance={configuration.appearance}>
            <div data-theme-part="screen">
              <header
                data-theme-part="header"
                className="flex min-h-16 items-center gap-3 border-b border-border bg-card px-4 py-3"
              >
                <span className="shrink-0 [&_img]:w-28">
                  <Brand />
                </span>
                <StoreLogo
                  logo={configuration.branding?.logo}
                  width={configuration.appearance?.header?.logoWidth ?? 144}
                  height={configuration.appearance?.header?.logoHeight ?? 40}
                  fallback={configuration.storeName ?? catalog.storeName}
                />
              </header>
              <div data-theme-part="menu" className="max-h-[44rem] overflow-y-auto bg-card">
                <ProductMenu
                  catalog={catalog}
                  onChoose={(product) =>
                    void navigate({
                      to: "/admin/stores/$storeId/menu/$section/$itemId",
                      params: { storeId: catalog.storeId, section: "products", itemId: product.id },
                      search,
                    })
                  }
                />
              </div>
            </div>
          </StoreTheme>
        </div>
      </section>
      <aside className="space-y-6 border-t border-border pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
        <h2 className="text-lg font-semibold">{t("theme_configuration_summary")}</h2>
        <dl className="space-y-4">
          {summary.map(([label, count]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="text-sm text-muted-foreground">{t(label)}</dt>
              <dd className="font-semibold tabular-nums">{count}</dd>
            </div>
          ))}
          <div className="space-y-1">
            <dt className="text-sm text-muted-foreground">{t("theme_masthead")}</dt>
            <dd>
              {t(
                configuration.appearance?.composition?.masthead?.visible
                  ? "editor_yes"
                  : "editor_no",
              )}
            </dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}
