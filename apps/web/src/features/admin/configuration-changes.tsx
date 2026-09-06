import type { ConfigDraft, Configuration } from "@tablecast/api/schema";
import type { ReactNode } from "react";
import { money, useI18n } from "../../i18n/locale";

const labels = {
  categories: "editor_categories",
  products: "editor_products",
  plans: "editor_plans",
  cast: "editor_cast",
  id: "editor_id",
  categoryId: "editor_category",
  price: "admin_unit_price",
  available: "admin_available",
  displayName: "admin_display_name",
  speechName: "admin_speech_name",
  description: "admin_description",
  aliases: "editor_aliases",
  tags: "editor_tags",
  imageKey: "editor_image",
  imageKind: "editor_image_kind",
  modifiers: "editor_modifiers",
  kind: "editor_kind",
  min: "editor_min",
  max: "editor_max",
  options: "editor_options",
  priceDelta: "editor_price_delta",
  maxQuantity: "editor_max_quantity",
  requires: "editor_requires",
  excludes: "editor_excludes",
  allergens: "kiosk_allergens",
  contains: "editor_contains",
  evidence: "editor_evidence",
  crossContact: "editor_cross_contact",
  vegan: "editor_vegan",
  note: "editor_safety_note",
  pricePerPerson: "editor_plan_price",
  durationMinutes: "editor_duration",
  lastOrderMinutesBeforeEnd: "editor_last_order",
  productIds: "editor_included_products",
  categoryIds: "editor_included_categories",
  maxPerOrder: "editor_max_order",
  maxTotalPerPerson: "editor_max_person",
  intervalSeconds: "editor_interval",
  excludedOptionIds: "editor_excluded_options",
  includedOptionSurcharge: "editor_option_surcharge",
  instructions: "editor_cast_instructions",
  voice: "editor_voice",
  proactive: "editor_proactive",
  ja: "common_ja",
  en: "common_en",
} as const;

export function ConfigurationChanges({
  changes,
  configuration,
}: {
  changes: ConfigDraft["changes"];
  configuration: Configuration;
}) {
  const { t, locale } = useI18n();
  const names = new Map(
    [
      ...configuration.categories,
      ...configuration.products,
      ...configuration.plans,
      ...configuration.products.flatMap((product) =>
        product.modifiers.flatMap((group) => [group, ...group.options]),
      ),
    ].map((item) => [item.id, item.text[locale].displayName]),
  );
  const labelKeys = new Map(Object.entries(labels));
  function fieldLabel(key: string) {
    const translation = labelKeys.get(key);
    return translation ? t(translation) : key;
  }
  function title(path: string) {
    const parts = path.split(".");
    const [collection, index] = parts;
    const item =
      collection === "products"
        ? configuration.products[Number(index)]
        : collection === "categories"
          ? configuration.categories[Number(index)]
          : collection === "plans"
            ? configuration.plans[Number(index)]
            : undefined;
    return [
      item?.text[locale].displayName ?? fieldLabel(collection ?? ""),
      ...parts
        .slice(item ? 2 : 1)
        .filter((part) => part !== "text")
        .map((part) => (/^\d+$/.test(part) ? String(Number(part) + 1) : fieldLabel(part))),
    ].join(" · ");
  }
  function valueText(value: unknown, key: string): ReactNode {
    if (value === null || value === undefined) return "—";
    if (typeof value === "boolean")
      return t(
        key === "available"
          ? value
            ? "admin_available"
            : "kiosk_sold_out"
          : value
            ? "config_change_enabled"
            : "config_change_disabled",
      );
    if (typeof value === "number")
      return ["price", "pricePerPerson", "priceDelta"].includes(key)
        ? money(value, locale)
        : String(value);
    if (typeof value === "string") {
      if (
        [
          "categoryId",
          "productIds",
          "categoryIds",
          "excludedOptionIds",
          "requires",
          "excludes",
        ].includes(key)
      )
        return names.get(value) ?? value;
      if (key === "imageKind")
        return value === "photograph" ? t("editor_photograph") : t("kiosk_illustration");
      if (key === "kind") {
        if (value === "single") return t("editor_single");
        if (value === "multiple") return t("editor_multiple");
        if (value === "quantity") return t("editor_quantity");
      }
      if (["evidence", "crossContact", "vegan"].includes(key)) {
        if (value === "unknown") return t("editor_unknown");
        if (value === "verified") return t("editor_verified");
        if (value === "possible") return t("editor_possible");
        if (value === "controlled") return t("editor_controlled");
        if (value === "yes") return t("editor_yes");
        if (value === "no") return t("editor_no");
      }
      return value || "—";
    }
    if (Array.isArray(value))
      return value.length ? (
        <ul className="list-inside list-disc">
          {value.map((item, index) => (
            <li key={index}>{valueText(item, key)}</li>
          ))}
        </ul>
      ) : (
        "—"
      );
    if (typeof value === "object")
      return (
        <dl className="grid gap-2">
          {Object.entries(value).map(([field, content]) => (
            <div key={field}>
              <dt className="font-semibold">
                {field === "text" ? t("config_change_content") : fieldLabel(field)}
              </dt>
              <dd className="pl-3">{valueText(content, field)}</dd>
            </div>
          ))}
        </dl>
      );
    return JSON.stringify(value) ?? "—";
  }
  return (
    <>
      {changes.map((change) => {
        const key =
          change.path
            .split(".")
            .reverse()
            .find((part) => !/^\d+$/.test(part)) ?? "";
        return (
          <div className="config-change" key={change.path}>
            <strong>{title(change.path)}</strong>
            <div>
              {[
                { label: t("admin_before"), value: change.before },
                { label: t("admin_after"), value: change.after },
              ].map(({ label, value }) => (
                <section key={label}>
                  <h4>{label}</h4>
                  <div className="whitespace-pre-wrap break-words text-sm">
                    {valueText(value, key)}
                  </div>
                </section>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
