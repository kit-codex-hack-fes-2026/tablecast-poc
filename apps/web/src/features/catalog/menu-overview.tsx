import type { Configuration } from "@tablecast/api/schema";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "../../components/page-header";
import { Button } from "../../components/ui/button";
import { money } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { StartConfigurationEditing } from "../configuration/configuration-workflow";
import {
  emptyMenuListSearch,
  menuLabels,
  type MenuListSearch,
  type MenuSection,
} from "../configuration/menu-model";
import { useStore } from "../store/store-context";
import {
  MenuDescription,
  PlanContents,
  ProductDetails,
  ProductSummary,
} from "./menu-product-details";

export function MenuOverview({
  configuration,
  section,
  itemId,
  search = emptyMenuListSearch,
}: {
  configuration: Configuration;
  itemId: string;
  search?: MenuListSearch;
  section: MenuSection;
}) {
  const { id: storeId, role } = useStore();
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const item =
    section === "cast" ? null : configuration[section].find((value) => value.id === itemId);
  const product =
    section === "products"
      ? configuration.products.find((value) => value.id === itemId)
      : undefined;
  const plan =
    section === "plans" ? configuration.plans.find((value) => value.id === itemId) : undefined;
  return (
    <section className="space-y-6">
      <Button
        nativeButton={false}
        role="link"
        variant="ghost"
        render={
          <Link
            to="/admin/stores/$storeId/menu/$section"
            params={{ storeId, section }}
            search={search}
          />
        }
      >
        <ArrowLeft />
        {t(menuLabels[section])}
      </Button>
      <PageHeader
        title={item?.text[locale].displayName ?? t(menuLabels[section])}
        actions={
          (role === "owner" || role === "admin") && (
            <StartConfigurationEditing
              key={storeId}
              section={section}
              itemId={itemId}
              onSelect={(draftId) =>
                void navigate({
                  to: "/admin/stores/$storeId/menu/changes/$draftId/$section/$itemId",
                  params: { storeId, draftId, section, itemId },
                  search,
                })
              }
            />
          )
        }
      />
      {section !== "cast" && !item ? (
        <p>{t("menu_item_missing")}</p>
      ) : (
        <>
          {product && <ProductSummary product={product} categories={configuration.categories} />}
          {plan && (
            <dl className="flex flex-wrap gap-8">
              <div>
                <dt className="text-sm text-muted-foreground">{t("editor_plan_price")}</dt>
                <dd className="text-xl font-semibold">{money(plan.pricePerPerson, locale)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">{t("editor_duration")}</dt>
                <dd className="text-xl font-semibold">
                  {plan.durationMinutes} {t("kiosk_minutes")}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">{t("editor_last_order")}</dt>
                <dd className="text-xl font-semibold">
                  {plan.lastOrderMinutesBeforeEnd} {t("kiosk_minutes")}
                </dd>
              </div>
            </dl>
          )}
          <MenuDescription item={item} cast={configuration.cast} />
          {product && <ProductDetails product={product} />}

          {section === "categories" && (
            <section className="space-y-3">
              <h2 className="font-semibold">{t("menu_category_products")}</h2>
              <ul className="space-y-2">
                {configuration.products.flatMap((entry) =>
                  entry.categoryId === itemId
                    ? [
                        <li key={entry.id}>
                          <Link
                            className="underline underline-offset-4"
                            to="/admin/stores/$storeId/menu/$section/$itemId"
                            params={{ storeId, section: "products", itemId: entry.id }}
                            search={{ category: itemId }}
                          >
                            {entry.text[locale].displayName}
                          </Link>
                        </li>,
                      ]
                    : [],
                )}
              </ul>
              {!configuration.products.some((entry) => entry.categoryId === itemId) && (
                <p>{t("common_empty")}</p>
              )}
            </section>
          )}
          {plan && <PlanContents plan={plan} configuration={configuration} />}
        </>
      )}
    </section>
  );
}
