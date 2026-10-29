import { dietaryKeys, foodClassification, type FoodProfile } from "@tablecast/api/schema";
import { useI18n } from "../i18n/locale";
import { dietaryLabels, foodStatusLabels, otherAllergenLabels } from "./food-information-model";

export function FoodInformationView({ value }: { value?: FoodProfile }) {
  const { t, locale } = useI18n();
  if (!value) return <p className="text-sm text-muted-foreground">{t("food_unrecorded")}</p>;
  return (
    <div className="grid gap-4 text-sm" data-ui="food-information">
      <div className="grid gap-4 sm:grid-cols-3">
        {(["contains", "unknown", "not_used"] as const).map((status) => {
          const items = foodClassification.allergens.filter(
            (item) => (value.allergens[item.id] ?? "unknown") === status,
          );
          return status === "contains" ? (
            <div key={status}>
              <p className="font-medium">{t(foodStatusLabels[status])}</p>
              <p>
                {[
                  ...items.map((item) => item.name[locale]),
                  ...value.otherAllergens.map((item) => {
                    const label = otherAllergenLabels[item];
                    return label ? t(label) : item;
                  }),
                ].join(" · ") || t("food_no_recorded_contains")}
              </p>
            </div>
          ) : (
            <details key={status}>
              <summary className="min-h-11 cursor-pointer py-3 font-medium">
                {t(foodStatusLabels[status])} · {items.length} {t("food_items")}
              </summary>
              <p>{items.map((item) => item.name[locale]).join(" · ") || t("common_empty")}</p>
            </details>
          );
        })}
      </div>
      <p>
        {t("editor_cross_contact")}: {t(foodStatusLabels[value.crossContact])}
      </p>
      <dl className="grid gap-4 sm:grid-cols-2">
        {dietaryKeys.map((key) => (
          <div key={key}>
            <dt className="font-medium">
              {t(dietaryLabels[key])}: {t(foodStatusLabels[value.dietary[key].status])}
            </dt>
            <dd>
              <details>
                <summary className="min-h-11 cursor-pointer py-3 text-muted-foreground">
                  {t("food_basis")}
                </summary>
                <p className="whitespace-pre-line text-muted-foreground">
                  {value.dietary[key].basis[locale] || t("editor_unknown")}
                </p>
              </details>
            </dd>
          </div>
        ))}
      </dl>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 font-medium">
          {t("food_ingredient_basis")}
        </summary>
        <p className="whitespace-pre-line text-muted-foreground">
          {value.basis[locale] || t("editor_unknown")}
        </p>
      </details>
    </div>
  );
}
