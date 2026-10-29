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

const states = {
  contains: {
    icon: TriangleAlert,
    variant: "destructive",
    label: "food_contains",
    color: "text-destructive",
  },
  not_used: {
    icon: CircleCheck,
    variant: "success",
    label: "food_not_used_short",
    color: "text-success",
  },
  unknown: {
    icon: CircleHelp,
    variant: "inactive",
    label: "food_unknown",
    color: "text-muted-foreground",
  },
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
  const ContactIcon = value.crossContact === "controlled" ? ShieldCheck : states[contact].icon;
  const halalBasis = value.dietary.halal.basis[locale];
  return (
    <div className="grid min-w-0 gap-1.5 text-xs" data-ui="food-information">
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground" aria-hidden="true">
        {(["contains", "not_used", "unknown"] as const).map((status) => {
          const Icon = states[status].icon;
          return (
            <span key={status} className={`inline-flex items-center gap-1 ${states[status].color}`}>
              <Icon className="size-3" />
              {t(states[status].label)}
            </span>
          );
        })}
      </div>
      <ul
        aria-label={t("food_allergens")}
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- 食材一覧の横スクロールをキーボードでも操作する。
        tabIndex={0}
        className="flex min-w-0 gap-1.5 overflow-x-auto rounded-lg pb-1 outline-none focus-visible:ring-2 focus-visible:ring-ring scrollbar-thin"
      >
        {(["contains", "unknown", "not_used"] as const).flatMap((status) =>
          [...allergens, ...others]
            .filter((item) => item.status === status)
            .map((item) => {
              const state = states[status];
              const Icon = state.icon;
              return (
                <li key={item.id} className="shrink-0">
                  <Badge
                    variant={state.variant}
                    data-food-allergen={item.id}
                    data-status={status}
                    aria-label={`${item.name}: ${t(state.label)}`}
                    title={`${item.name}: ${t(state.label)}`}
                    className={`gap-1.5 rounded-full px-2.5 py-1 text-xs whitespace-nowrap ${status === "unknown" ? "border-dashed" : ""}`}
                  >
                    <span aria-hidden="true">{item.emoji}</span>
                    {item.name}
                    <Icon aria-hidden="true" />
                  </Badge>
                </li>
              );
            }),
        )}
      </ul>
      <ul
        aria-label={t("food_dietary")}
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- 食事区分の横スクロールをキーボードでも操作する。
        tabIndex={0}
        className="flex min-w-0 gap-1.5 overflow-x-auto rounded-lg pb-1 outline-none focus-visible:ring-2 focus-visible:ring-ring scrollbar-thin"
      >
        {dietaryKeys.map((key) => {
          const status = value.dietary[key].status;
          const state =
            states[status === "yes" ? "not_used" : status === "no" ? "contains" : "unknown"];
          const Icon = dietaryIcons[key];
          const StatusIcon = status === "no" ? CircleX : state.icon;
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
            variant={states[contact].variant}
            className="gap-1.5 rounded-md px-2 py-1 text-xs whitespace-nowrap"
            aria-label={`${t("editor_cross_contact")}: ${t(foodStatusLabels[value.crossContact])}`}
          >
            <ContactIcon aria-hidden="true" />
            {t("food_cross_contact_short")}: {t(foodStatusLabels[value.crossContact])}
          </Badge>
        </li>
      </ul>
      {halalBasis && (
        <p className="line-clamp-1 text-xs text-muted-foreground" title={halalBasis}>
          {t("food_halal")}: {halalBasis}
        </p>
      )}
    </div>
  );
}
