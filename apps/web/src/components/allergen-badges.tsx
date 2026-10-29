import { foodClassification, type JapaneseAllergen } from "@tablecast/api/schema";
import { CircleHelp } from "lucide-react";
import { useI18n } from "../i18n/locale";
import { allergenEmoji } from "./food-information-model";
import { Badge } from "./ui/badge";

export function AllergenBadges({
  contains,
  unverified = false,
  label,
}: {
  contains: JapaneseAllergen[];
  label?: string;
  unverified?: boolean;
}) {
  const { t, locale } = useI18n();
  const ids = new Set(contains);
  const items = foodClassification.allergens.filter((item) => ids.has(item.id));
  const names = [
    ...items.map((item) => item.name[locale]),
    ...(unverified ? [t("food_unknown")] : []),
  ];
  return (
    <ul
      aria-label={
        label
          ? `${label}: ${names.length ? names.join(locale === "ja" ? "、" : ", ") : t("food_allergens_none")}`
          : t("food_allergens")
      }
      className="flex min-w-0 flex-wrap gap-1"
    >
      {items.map((item) => (
        <li key={item.id}>
          <Badge
            variant="inactive"
            data-food-allergen={item.id}
            data-status="contains"
            aria-label={`${item.name[locale]}: ${t("food_contains")}`}
            className="gap-1 rounded-full px-2 py-0.5 text-xs"
          >
            <span aria-hidden="true">{allergenEmoji[item.id]}</span>
            {item.name[locale]}
          </Badge>
        </li>
      ))}
      {unverified && (
        <li>
          <Badge variant="inactive" className="gap-1 rounded-full px-2 py-0.5 text-xs">
            <CircleHelp aria-hidden="true" />
            {t("food_unknown")}
          </Badge>
        </li>
      )}
      {!contains.length && !unverified && (
        <li className="py-0.5 text-muted-foreground">{t("food_allergens_none")}</li>
      )}
    </ul>
  );
}
