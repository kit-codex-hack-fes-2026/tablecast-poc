import type { ReactNode } from "react";
import type { VariantProps } from "tailwind-variants";
import { Popover } from "@base-ui/react/popover";
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
  X,
} from "lucide-react";
import type { badgeVariants } from "./ui/badge-variants";
import { useI18n } from "../i18n/locale";
import { AllergenBadges } from "./allergen-badges";
import {
  crossContactSourceLabels,
  dietaryLabels,
  dietaryReasonLabels,
  foodStatusLabels,
  halalCertificationLabels,
} from "./food-information-model";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { surfaceMotion } from "./ui/motion-variants";

const dietaryStates = {
  yes: { icon: CircleCheck, variant: "success" },
  no: { icon: CircleX, variant: "destructive" },
  unknown: { icon: CircleHelp, variant: "inactive" },
} as const;
const dietaryIcons = { vegan: Leaf, vegetarian: Sprout, halal: MoonStar, glutenFree: WheatOff };

function FoodDetailsBadge({
  label,
  variant,
  children,
  details,
  dietary,
  status,
}: {
  children: ReactNode;
  details: ReactNode;
  dietary?: string;
  label: string;
  status: string;
  variant: VariantProps<typeof badgeVariants>["variant"];
}) {
  const { t } = useI18n();
  return (
    <Popover.Root>
      <Popover.Trigger
        render={<Badge render={<button type="button" aria-label={label} />} variant={variant} />}
        aria-label={label}
        data-food-dietary={dietary}
        data-status={status}
        className="min-h-11 gap-1.5 rounded-md py-1 text-xs [a,button]:px-2"
      >
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} collisionPadding={12} className="z-50">
          <Popover.Popup
            className={surfaceMotion({
              kind: "popup",
              className:
                "w-72 max-w-[calc(100vw-1.5rem)] rounded-xl border border-border bg-popover p-3 text-sm text-popover-foreground shadow-lg",
            })}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <Popover.Title className="font-semibold">{label}</Popover.Title>
              <Popover.Close
                render={<Button variant="ghost" size="icon-sm" aria-label={t("common_close")} />}
              >
                <X aria-hidden="true" />
              </Popover.Close>
            </div>
            {details}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function FoodInformationView({
  value,
  caption,
}: {
  caption?: ReactNode;
  value?: FoodProfile;
}) {
  const { t } = useI18n();
  if (!value) return <p className="text-xs text-muted-foreground">{t("food_unrecorded")}</p>;
  const contains = foodClassification.allergens
    .filter((item) => value.allergens[item.id] === "contains")
    .map((item) => item.id);
  const unverified = foodClassification.allergens.some(
    (item) => (value.allergens[item.id] ?? "unknown") === "unknown",
  );
  const ContactIcon =
    value.crossContact === "controlled"
      ? ShieldCheck
      : value.crossContact === "possible"
        ? TriangleAlert
        : CircleHelp;
  const contactVariant =
    value.crossContact === "possible"
      ? "destructive"
      : value.crossContact === "controlled"
        ? "success"
        : "inactive";
  return (
    <div className="grid min-w-0 gap-1.5 text-xs" data-ui="food-information">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="shrink-0 py-0.5 font-medium">{t("food_allergens")}</span>
        <AllergenBadges contains={contains} unverified={unverified} />
        {caption && (
          <div className="flex min-h-6 items-center gap-2 text-muted-foreground">{caption}</div>
        )}
      </div>
      <div className="min-w-0">
        <ul aria-label={t("food_dietary")} className="flex min-w-0 flex-wrap items-center gap-1">
          <li aria-hidden="true" className="pr-1 font-medium">
            {t("food_dietary")}
          </li>
          {dietaryKeys.map((key) => {
            const assessment = value.dietary[key];
            const state = dietaryStates[assessment.status];
            const Icon = dietaryIcons[key];
            const StatusIcon = state.icon;
            const label = t(key === "vegetarian" ? "food_vegetarian_short" : dietaryLabels[key]);
            const statusLabel = t(
              assessment.status === "unknown"
                ? "food_unknown"
                : foodStatusLabels[assessment.status],
            );
            return (
              <li key={key} className="min-w-0">
                <FoodDetailsBadge
                  label={`${label}: ${statusLabel}`}
                  variant={state.variant}
                  dietary={key}
                  status={assessment.status}
                  details={
                    <ul className="grid gap-2">
                      {key === "halal" && (
                        <li>
                          {t("food_halal_certification")}:{" "}
                          {t(halalCertificationLabels[value.halalCertification])}
                        </li>
                      )}
                      {assessment.reasons.length ? (
                        assessment.reasons.map((reason) => (
                          <li key={reason}>{t(dietaryReasonLabels[reason])}</li>
                        ))
                      ) : (
                        <li>{t("food_unknown")}</li>
                      )}
                    </ul>
                  }
                >
                  <Icon aria-hidden="true" />
                  {label}
                  <StatusIcon aria-hidden="true" />
                </FoodDetailsBadge>
              </li>
            );
          })}
          <li className="min-w-0">
            <FoodDetailsBadge
              label={`${t("editor_cross_contact")}: ${t(foodStatusLabels[value.crossContact])}`}
              variant={contactVariant}
              status={value.crossContact}
              details={
                <ul className="grid gap-2">
                  {value.crossContactSources.length ? (
                    value.crossContactSources.map((source) => (
                      <li key={source}>{t(crossContactSourceLabels[source])}</li>
                    ))
                  ) : (
                    <li>{t(foodStatusLabels[value.crossContact])}</li>
                  )}
                </ul>
              }
            >
              <ContactIcon aria-hidden="true" />
              {t("food_preparation")}
            </FoodDetailsBadge>
          </li>
        </ul>
      </div>
    </div>
  );
}
