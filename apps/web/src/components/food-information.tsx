import { dietaryKeys, foodClassification, type FoodProfile } from "@tablecast/api/schema";
import {
  CircleCheck,
  CircleHelp,
  CircleX,
  Leaf,
  MoonStar,
  ShieldCheck,
  Sprout,
  TriangleAlert,
  WheatOff,
} from "lucide-react";
import { useI18n } from "../i18n/locale";
import {
  allergenEmoji,
  dietaryLabels,
  foodStatusLabels,
  otherAllergenLabels,
} from "./food-information-model";
import { Badge } from "./ui/badge";

const dietaryStates = {
  yes: { icon: CircleCheck, variant: "success", label: "food_yes" },
  no: { icon: CircleX, variant: "destructive", label: "food_no" },
  unknown: { icon: CircleHelp, variant: "inactive", label: "food_unknown" },
} as const;
const dietaryIcons = { vegan: Leaf, vegetarian: Sprout, halal: MoonStar, glutenFree: WheatOff };

export function FoodInformationView({ value }: { value?: FoodProfile }) {
  const { t, locale } = useI18n();
  if (!value) return <p className="text-xs text-muted-foreground">{t("food_unrecorded")}</p>;
  const allergens = foodClassification.allergens.map((item) => ({
    id: item.id,
    name: item.name[locale],
    emoji: allergenEmoji[item.id],
    status: value.allergens[item.id] ?? "unknown",
  }));
  const others = value.otherAllergens.map((id) => ({
    id,
    name: otherAllergenLabels[id] ? t(otherAllergenLabels[id]) : id,
    emoji: allergenEmoji[id] ?? "🍽️",
    status: "contains" as const,
  }));
  const contact =
    value.crossContact === "possible"
      ? "contains"
      : value.crossContact === "controlled"
        ? "not_used"
        : "unknown";
  const ContactIcon =
    value.crossContact === "controlled"
      ? ShieldCheck
      : value.crossContact === "possible"
        ? TriangleAlert
        : CircleHelp;
  const contactVariant =
    contact === "contains" ? "destructive" : contact === "not_used" ? "success" : "inactive";
  const halalBasis = value.dietary.halal.basis[locale];
  return (
    <div className="grid min-w-0 gap-1.5 text-xs" data-ui="food-information">
      <div className="flex min-w-0 items-start gap-2">
        <span className="shrink-0 py-1 font-medium">{t("food_allergens")}</span>
        <ul
          aria-label={t("food_allergens")}
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- 横長の食材一覧をキーボードでもスクロールする。
          tabIndex={0}
          className="flex min-w-0 gap-1.5 overflow-x-auto rounded-lg pb-1 outline-none focus-visible:ring-2 focus-visible:ring-ring scrollbar-thin"
        >
          {[...allergens, ...others]
            .filter((item) => item.status === "contains")
            .map((item) => (
              <li key={item.id} className="shrink-0">
                <Badge
                  variant="destructive"
                  data-food-allergen={item.id}
                  data-status="contains"
                  aria-label={`${item.name}: ${t("food_contains")}`}
                  title={`${item.name}: ${t("food_contains")}`}
                  className="gap-1.5 rounded-full px-2.5 py-1 text-xs whitespace-nowrap"
                >
                  <span aria-hidden="true">{item.emoji}</span>
                  {item.name}
                </Badge>
              </li>
            ))}
          {allergens.some((item) => item.status === "unknown") ? (
            <li className="shrink-0">
              <Badge
                variant="inactive"
                className="gap-1.5 rounded-full px-2.5 py-1 text-xs whitespace-nowrap"
              >
                <CircleHelp aria-hidden="true" />
                {t("food_unknown")}
              </Badge>
            </li>
          ) : !allergens.some((item) => item.status === "contains") && !others.length ? (
            <li className="py-1 text-muted-foreground">{t("food_allergens_none")}</li>
          ) : null}
        </ul>
      </div>
      <div className="flex min-w-0 items-start gap-2">
        <span className="shrink-0 py-1 font-medium">{t("food_dietary")}</span>
        <ul
          aria-label={t("food_dietary")}
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- 食事区分の横スクロールをキーボードでも操作する。
          tabIndex={0}
          className="flex min-w-0 gap-1.5 overflow-x-auto rounded-lg pb-1 outline-none focus-visible:ring-2 focus-visible:ring-ring scrollbar-thin"
        >
          {dietaryKeys.map((key) => {
            const status = value.dietary[key].status;
            const state = dietaryStates[status];
            const Icon = dietaryIcons[key];
            const StatusIcon = state.icon;
            const label = t(key === "vegetarian" ? "food_vegetarian_short" : dietaryLabels[key]);
            const statusLabel = t(status === "unknown" ? "food_unknown" : foodStatusLabels[status]);
            return (
              <li key={key} className="shrink-0">
                <Badge
                  variant={state.variant}
                  data-food-dietary={key}
                  data-status={status}
                  aria-label={`${label}: ${statusLabel}`}
                  title={`${label}: ${statusLabel}`}
                  className={`gap-1.5 rounded-md px-2 py-1 text-xs whitespace-nowrap ${status === "unknown" ? "border-dashed" : ""}`}
                >
                  <Icon aria-hidden="true" />
                  {label}
                  <StatusIcon aria-hidden="true" />
                </Badge>
              </li>
            );
          })}
          <li className="shrink-0">
            <Badge
              variant={contactVariant}
              className="gap-1.5 rounded-md px-2 py-1 text-xs whitespace-nowrap"
              aria-label={`${t("editor_cross_contact")}: ${t(foodStatusLabels[value.crossContact])}`}
            >
              <ContactIcon aria-hidden="true" />
              {t("food_cross_contact_short")}: {t(foodStatusLabels[value.crossContact])}
            </Badge>
          </li>
        </ul>
      </div>
      {halalBasis && (
        <p className="line-clamp-1 text-xs text-muted-foreground" title={halalBasis}>
          {t("food_halal")}: {halalBasis}
        </p>
      )}
    </div>
  );
}
