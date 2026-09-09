import type { Configuration } from "@tablecast/api/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeft, Check, FilePenLine, TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import { DataTable } from "../../components/data-table";
import { ErrorNotice } from "../../components/error-notice";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { money } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { menuLabels, type MenuSection } from "./menu-model";
import { draftOptions } from "./menu-query";
import { useStore } from "./store-shell";

type OptionRow = { id: string; group: string; name: string; price: number; available: boolean };
export function MenuOverview({
  configuration,
  section,
  itemId,
}: {
  configuration: Configuration;
  section: MenuSection;
  itemId: string;
}) {
  const { id: storeId, role } = useStore();
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const client = useQueryClient();
  const item =
    section === "cast" ? null : configuration[section].find((value) => value.id === itemId);
  const product =
    section === "products"
      ? configuration.products.find((value) => value.id === itemId)
      : undefined;
  const plan =
    section === "plans" ? configuration.plans.find((value) => value.id === itemId) : undefined;
  const planProducts = new Set(plan?.productIds);
  const planCategories = new Set(plan?.categoryIds);
  const create = useMutation({
    mutationFn: () =>
      parseResponse(rpc.api.admin.stores[":storeId"].drafts.$post({ param: { storeId } })),
    onSuccess: (next) => {
      client.setQueryData(draftOptions(storeId, next.id).queryKey, next);
      void client.invalidateQueries({ queryKey: ["tablecast-drafts", storeId] });
      void navigate({
        to: "/admin/stores/$storeId/menu/changes/$draftId/$section/$itemId",
        params: { storeId, draftId: next.id, section, itemId },
      });
    },
  });
  const columns = useMemo(() => menuOverviewColumns(t, locale), [t, locale]);
  return (
    <section className="space-y-6">
      <Button
        nativeButton={false}
        role="link"
        variant="ghost"
        render={<Link to="/admin/stores/$storeId/menu/$section" params={{ storeId, section }} />}
      >
        <ArrowLeft />
        {t(menuLabels[section])}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {item?.text[locale].displayName ?? t(menuLabels[section])}
        </h1>
        {(role === "owner" || role === "admin") && (
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            <FilePenLine />
            {t("menu_start_editing")}
          </Button>
        )}
      </div>
      <ErrorNotice error={create.error} />
      {section !== "cast" && !item ? (
        <p>{t("menu_item_missing")}</p>
      ) : (
        <>
          {product && (
            <div className="flex flex-wrap items-center gap-5">
              {product.imageKey && (
                <img
                  className="size-40 rounded-xl object-cover"
                  src={`/media/${product.imageKey}`}
                  alt={product.text[locale].displayName}
                />
              )}
              <div className="space-y-3">
                <span className="block text-2xl font-semibold tabular-nums">
                  {money(product.price, locale)}
                </span>
                <Badge variant={product.available ? "success" : "inactive"}>
                  {product.available ? (
                    <Check className="size-4" />
                  ) : (
                    <TriangleAlert className="size-4" />
                  )}
                  {t(product.available ? "editor_available" : "kiosk_sold_out")}
                </Badge>
                <p className="text-base text-muted-foreground">
                  {
                    configuration.categories.find((category) => category.id === product.categoryId)
                      ?.text[locale].displayName
                  }
                </p>
              </div>
            </div>
          )}
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
          <div className="grid gap-6 sm:grid-cols-2">
            {(["ja", "en"] as const).map((language) => (
              <section key={language} className="space-y-3 rounded-xl border border-border p-5">
                <h2 className="font-semibold">
                  {t(language === "ja" ? "common_ja" : "common_en")}
                </h2>
                {item ? (
                  <>
                    <p className="font-medium">{item.text[language].displayName}</p>
                    <p className="whitespace-pre-wrap text-base leading-relaxed">
                      {item.text[language].description || "—"}
                    </p>
                    <dl className="space-y-3 border-t border-border pt-3">
                      <div>
                        <dt className="text-sm text-muted-foreground">{t("admin_speech_name")}</dt>
                        <dd>{item.text[language].speechName}</dd>
                      </div>
                      <div>
                        <dt className="text-sm text-muted-foreground">{t("editor_aliases")}</dt>
                        <dd>{item.text[language].aliases.join(" · ") || "—"}</dd>
                      </div>
                    </dl>
                  </>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap leading-relaxed">
                      {configuration.cast.instructions[language] || "—"}
                    </p>
                    <dl>
                      <dt className="text-sm text-muted-foreground">{t("editor_voice")}</dt>
                      <dd>{configuration.cast.voice[language] ?? t("editor_not_configured")}</dd>
                    </dl>
                  </>
                )}
              </section>
            ))}
          </div>
          {product && (
            <>
              <section className="space-y-4 rounded-xl border border-border p-5">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <TriangleAlert className="size-5" />
                  {t("kiosk_allergens")}
                </h2>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm text-muted-foreground">{t("editor_contains")}</dt>
                    <dd>{product.allergens.contains.join(" · ") || t("common_empty")}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">{t("editor_evidence")}</dt>
                    <dd>
                      {t(
                        product.allergens.evidence === "verified"
                          ? "editor_verified"
                          : "editor_unknown",
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">{t("editor_cross_contact")}</dt>
                    <dd>
                      {t(
                        product.allergens.crossContact === "possible"
                          ? "editor_possible"
                          : product.allergens.crossContact === "controlled"
                            ? "editor_controlled"
                            : "editor_unknown",
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">{t("editor_vegan")}</dt>
                    <dd>
                      {t(
                        product.allergens.vegan === "yes"
                          ? "editor_yes"
                          : product.allergens.vegan === "no"
                            ? "editor_no"
                            : "editor_unknown",
                      )}
                    </dd>
                  </div>
                </dl>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {product.allergens.note[locale]}
                </p>
              </section>
              <section className="space-y-4">
                <h2 className="text-lg font-semibold">{t("editor_modifiers")}</h2>
                <DataTable
                  data={product.modifiers.flatMap((group) =>
                    group.options.map((option) => ({
                      id: option.id,
                      group: group.text[locale].displayName,
                      name: option.text[locale].displayName,
                      price: option.priceDelta,
                      available: option.available,
                    })),
                  )}
                  columns={columns}
                  getRowId={(row) => row.id}
                  pagination={false}
                />
              </section>
            </>
          )}
          {plan && (
            <div className="space-y-3">
              <h2 className="font-semibold">{t("editor_included_products")}</h2>
              <p>
                {configuration.products
                  .flatMap((entry) =>
                    planProducts.has(entry.id) ? [entry.text[locale].displayName] : [],
                  )
                  .join(" · ") || "—"}
              </p>
              <h2 className="font-semibold">{t("editor_included_categories")}</h2>
              <p>
                {configuration.categories
                  .flatMap((category) =>
                    planCategories.has(category.id) ? [category.text[locale].displayName] : [],
                  )
                  .join(" · ") || "—"}
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function menuOverviewColumns(
  t: ReturnType<typeof useI18n>["t"],
  locale: ReturnType<typeof useI18n>["locale"],
): ColumnDef<OptionRow>[] {
  return [
    { accessorKey: "group", header: t("editor_modifiers") },
    { accessorKey: "name", header: t("editor_options") },
    {
      accessorKey: "price",
      header: t("editor_price_delta"),
      cell: ({ row }) => money(row.original.price, locale),
    },
    {
      accessorKey: "available",
      header: t("common_status"),
      cell: ({ row }) => (
        <Badge variant="outline">
          {t(row.original.available ? "editor_available" : "kiosk_sold_out")}
        </Badge>
      ),
    },
  ];
}
