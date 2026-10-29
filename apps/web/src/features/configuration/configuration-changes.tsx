import type { ConfigDraft, Configuration } from "@tablecast/api/schema";
import type { ReactNode } from "react";
import { resolveText } from "@tablecast/api/localization";
import { castInstructionSchema } from "@tablecast/api/schema";
import { ArrowRight, Minus, Pencil, Plus } from "lucide-react";
import { Children } from "react";
import { Badge } from "../../components/ui/badge";
import { money } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { labels } from "./configuration-change-labels-model";
import { InstructionView } from "./instruction-view";

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
    ].map((item) => [item.id, resolveText(item.text, locale).displayName]),
  );
  const labelKeys = new Map(Object.entries(labels));
  function fieldLabel(key: string) {
    const translation = labelKeys.get(key);
    return translation ? t(translation) : key;
  }
  function title(path: string, wholeObject = false) {
    const parts = path.split(".");
    const [collection, index] = parts;
    const replacement = changes.find((change) => change.path === [collection, index].join("."));
    const text =
      replacement?.before && typeof replacement.before === "object" && "text" in replacement.before
        ? replacement.before.text
        : undefined;
    const localized: unknown =
      text && typeof text === "object"
        ? Object.entries(text).find(([key]) => key === locale)?.[1]
        : undefined;
    const previousName =
      localized &&
      typeof localized === "object" &&
      "displayName" in localized &&
      typeof localized.displayName === "string"
        ? localized.displayName
        : undefined;
    const item =
      collection === "products"
        ? configuration.products[Number(index)]
        : collection === "categories"
          ? configuration.categories[Number(index)]
          : collection === "plans"
            ? configuration.plans[Number(index)]
            : undefined;
    if (wholeObject)
      return (
        previousName ??
        (item ? resolveText(item.text, locale).displayName : undefined) ??
        fieldLabel(collection ?? "")
      );
    return [
      previousName ??
        (item ? resolveText(item.text, locale).displayName : undefined) ??
        fieldLabel(collection ?? ""),
      ...parts
        .slice(item ? 2 : 1)
        .flatMap((part) =>
          part !== "text" ? [/^\d+$/.test(part) ? String(Number(part) + 1) : fieldLabel(part)] : [],
        ),
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
      if (key === "id") return t("config_change_identifier");
      if (
        [
          "categoryId",
          "productIds",
          "categoryIds",
          "excludedOptionIds",
          "optionId",
          "requires",
          "excludes",
        ].includes(key)
      )
        return names.get(value) ?? t("editor_missing_reference");
      if (key === "imageKind")
        return value === "photograph" ? t("editor_photograph") : t("kiosk_illustration");
      if (key === "kind") {
        if (value === "single") return t("editor_single");
        if (value === "multiple") return t("editor_multiple");
        if (value === "quantity") return t("editor_quantity");
        if (value === "and") return t("condition_all");
        if (value === "or") return t("condition_any");
        if (value === "not") return t("condition_not_scope");
        if (value === "option") return t("condition_leaf");
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
          {Children.toArray(value.map((item) => <li>{valueText(item, key)}</li>))}
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
  const groups = Map.groupBy(changes, (change) => {
    const [collection, index] = change.path.split(".");
    return ["products", "categories", "plans"].includes(collection ?? "")
      ? `${collection}.${index}`
      : (collection ?? change.path);
  });
  return (
    <div className="space-y-6">
      {[...groups].map(([path, grouped]) => (
        <section
          key={path}
          className="overflow-hidden rounded-2xl border border-border bg-card shadow-surface"
        >
          <h2 className="border-b border-border bg-surface-subtle px-4 py-3 font-semibold">
            {title(path, true)}
          </h2>
          <div className="divide-y divide-border">
            {grouped.map((change) => {
              const key =
                change.path
                  .split(".")
                  .toReversed()
                  .find((part) => !/^\d+$/.test(part)) ?? "";
              return (
                <div
                  data-ui="config-change"
                  data-change-path={change.path}
                  className="p-4 [&_pre]:bg-background [&_pre]:rounded-md [&_pre]:p-3 [&_pre]:overflow-auto [&_pre]:text-sm [&_pre]:max-h-64 [&_pre]:m-0"
                  key={change.path}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold wrap-anywhere">
                      {title(change.path).split(" · ").slice(1).join(" · ") || title(change.path)}
                    </h3>
                    <Badge
                      variant={
                        change.before == null
                          ? "success"
                          : change.after == null
                            ? "destructive"
                            : "warning"
                      }
                    >
                      {change.before == null ? (
                        <Plus />
                      ) : change.after == null ? (
                        <Minus />
                      ) : (
                        <Pencil />
                      )}
                      {t(
                        change.before == null
                          ? "config_change_added"
                          : change.after == null
                            ? "config_change_removed"
                            : "config_change_updated",
                      )}
                    </Badge>
                  </div>
                  <div className="mt-3 grid max-w-4xl grid-cols-[1fr_auto_1fr] items-start gap-3 max-sm:grid-cols-1">
                    {[
                      { label: t("admin_before"), value: change.before },
                      { label: t("admin_after"), value: change.after },
                    ].map(({ label, value }, index) => (
                      <section
                        className={
                          index === 0
                            ? "min-w-0 rounded-xl bg-card p-3"
                            : "col-start-3 min-w-0 rounded-xl bg-success-soft p-3 max-sm:col-start-1"
                        }
                        key={label}
                      >
                        <h4 className="text-muted-foreground text-sm mb-1.5">{label}</h4>
                        <div className="whitespace-pre-wrap wrap-break-word text-base">
                          {/^cast\.instructions\.(ja|en)$/.test(change.path) &&
                          castInstructionSchema.safeParse(value).success ? (
                            <InstructionView value={castInstructionSchema.parse(value)} />
                          ) : (
                            valueText(value, key)
                          )}
                        </div>
                      </section>
                    ))}
                    <ArrowRight
                      aria-hidden="true"
                      className="col-start-2 row-start-1 mt-9 size-4 text-muted-foreground max-sm:hidden"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
