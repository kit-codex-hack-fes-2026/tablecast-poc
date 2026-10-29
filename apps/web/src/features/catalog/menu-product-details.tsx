import type { Configuration } from "@tablecast/api/schema";
import { resolveLocalized, resolveText } from "@tablecast/api/localization";
import { Check, ImageOff, TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import { DataTable } from "../../components/data-table";
import { ProductImage } from "../../components/product-image";
import { Badge } from "../../components/ui/badge";
import { money } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { InstructionView } from "../configuration/instruction-view";
import { LanguageFields } from "../configuration/language-fields";
import { type MenuSection } from "../configuration/menu-model";
import { useCollectionSearch } from "../shell/collection-search";
import { menuOverviewColumns } from "./menu-overview-columns";

export function ProductDetails({ product }: { product: Configuration["products"][number] }) {
  const { t, locale } = useI18n();
  const columns = useMemo(() => menuOverviewColumns(t), [t]);
  const collection = useCollectionSearch({
    prefix: "options",
    sortIds: ["group", "name", "price", "available"],
  });
  return (
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
              {t(product.allergens.evidence === "verified" ? "editor_verified" : "editor_unknown")}
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
          {resolveLocalized(product.allergens.note, locale)}
        </p>
      </section>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t("editor_modifiers")}</h2>
        <DataTable
          {...collection}
          searchLabel={t("editor_options")}
          searchPlaceholder={t("collection_search_options_placeholder")}
          data={product.modifiers.flatMap((group) =>
            group.options.map((option) => ({
              id: option.id,
              group: resolveText(group.text, locale).displayName,
              name: resolveText(option.text, locale).displayName,
              description: resolveText(option.text, locale).description,
              imageKey: option.imageKey,
              imageKind: option.imageKind,
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
  );
}

export function ProductSummary({
  product,
  categories,
}: {
  categories: Configuration["categories"];
  product: Configuration["products"][number];
}) {
  const { t, locale } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-5 rounded-xl bg-secondary/50 p-5">
      {product.imageKey ? (
        <ProductImage
          width={160}
          height={160}
          sizes="160px"
          className="size-40 rounded-xl object-cover"
          src={`/media/${product.imageKey}`}
          alt={resolveText(product.text, locale).displayName}
        />
      ) : (
        <div
          className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
          role="img"
          aria-label={t("editor_image_empty")}
        >
          <ImageOff className="size-5" aria-hidden="true" />
        </div>
      )}
      <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-3">
        <span className="block text-2xl font-semibold tabular-nums">
          {money(product.price, locale)}
        </span>
        <Badge variant={product.available ? "success" : "inactive"}>
          {product.available ? <Check className="size-4" /> : <TriangleAlert className="size-4" />}
          {t(product.available ? "editor_available" : "kiosk_sold_out")}
        </Badge>
        <p className="text-base text-muted-foreground">
          {(() => {
            const category = categories.find((item) => item.id === product.categoryId);
            return category ? resolveText(category.text, locale).displayName : "";
          })()}
        </p>
      </div>
    </div>
  );
}

export function MenuDescription({
  item,
  cast,
}: {
  cast: Configuration["cast"];
  item: NonNullable<Configuration[Exclude<MenuSection, "cast">]>[number] | null | undefined;
}) {
  const { t } = useI18n();
  return (
    <LanguageFields languages={item ? Object.keys(item.text) : Object.keys(cast.instructions)}>
      {(language) => (
        <section className="space-y-3 rounded-xl bg-surface-subtle p-5" lang={language}>
          {item ? (
            <>
              <p className="font-medium">{resolveText(item.text, language).displayName}</p>
              <p className="whitespace-pre-wrap text-base leading-relaxed">
                {resolveText(item.text, language).description || "—"}
              </p>
              <dl className="space-y-3 border-t border-border pt-3">
                <div>
                  <dt className="text-sm text-muted-foreground">{t("admin_speech_name")}</dt>
                  <dd>{resolveText(item.text, language).speechName}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">{t("editor_aliases")}</dt>
                  <dd>{resolveText(item.text, language).aliases.join(" · ") || "—"}</dd>
                </div>
              </dl>
            </>
          ) : (
            <>
              <div className="leading-relaxed">
                <InstructionView value={resolveLocalized(cast.instructions, language)} />
              </div>
              <dl>
                <dt className="text-sm text-muted-foreground">{t("editor_voice")}</dt>
                <dd>{resolveLocalized(cast.voice, language) ?? t("editor_not_configured")}</dd>
              </dl>
            </>
          )}
        </section>
      )}
    </LanguageFields>
  );
}

export function PlanContents({
  plan,
  configuration,
}: {
  configuration: Configuration;
  plan: Configuration["plans"][number];
}) {
  const { t, locale } = useI18n();
  const planProducts = new Set(plan.productIds);
  const planCategories = new Set(plan.categoryIds);
  return (
    <div className="space-y-3">
      <h2 className="font-semibold">{t("editor_included_products")}</h2>
      <p>
        {configuration.products
          .flatMap((entry) =>
            planProducts.has(entry.id) ? [resolveText(entry.text, locale).displayName] : [],
          )
          .join(" · ") || "—"}
      </p>
      <h2 className="font-semibold">{t("editor_included_categories")}</h2>
      <p>
        {configuration.categories
          .flatMap((category) =>
            planCategories.has(category.id) ? [resolveText(category.text, locale).displayName] : [],
          )
          .join(" · ") || "—"}
      </p>
      <h2 className="font-semibold">{t("editor_tags")}</h2>
      <p>{plan.tags.join(" · ") || "—"}</p>
    </div>
  );
}
