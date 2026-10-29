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
import { surfaceMotion } from "./ui/motion-variants";
import { Skeleton } from "./ui/skeleton";

const foodInformationLayout =
  "grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] items-start gap-2 text-xs";
const foodBadgeClass = "gap-1.5 rounded-md px-2 py-0.5 text-xs";

const dietaryStates = {
  yes: { icon: CircleCheck, variant: "success" },
  no: { icon: CircleX, variant: "destructive" },
  unknown: { icon: CircleHelp, variant: "inactive" },
} as const;
const dietaryIcons = { vegan: Leaf, vegetarian: Sprout, halal: MoonStar, glutenFree: WheatOff };

function FoodDetailsBadge({
  label,
  title,
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
  title: string;
  variant: VariantProps<typeof badgeVariants>["variant"];
}) {
  const { t } = useI18n();
  return (
    <Popover.Root>
      <Popover.Trigger
        render={<button type="button" aria-label={label} />}
        aria-label={label}
        data-food-dietary={dietary}
        data-status={status}
        data-variant={variant}
        className="inline-flex min-h-6 min-w-6 max-w-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Badge variant={variant} className={foodBadgeClass}>
          {children}
        </Badge>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} collisionPadding={12} className="z-50">
          <Popover.Popup
            className={surfaceMotion({
              kind: "popup",
              className:
                "w-max max-w-[min(16rem,calc(100vw-1.5rem))] rounded-lg border border-border bg-popover p-2.5 text-xs text-popover-foreground shadow-lg",
            })}
          >
            <div className="mb-1 flex items-center justify-between gap-3">
              <Popover.Title className="font-semibold">{title}</Popover.Title>
              <Popover.Close
                aria-label={t("common_close")}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-md outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3.5" aria-hidden="true" />
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
    <div className={foodInformationLayout} data-ui="food-information">
      <span className="py-0.5 font-medium">{t("food_allergens")}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <AllergenBadges contains={contains} unverified={unverified} />
        {caption && (
          <div className="flex min-h-6 items-center gap-2 text-muted-foreground">{caption}</div>
        )}
      </div>
      <span className="py-0.5 font-medium">{t("food_dietary")}</span>
      <div className="min-w-0">
        <ul aria-label={t("food_dietary")} className="flex min-w-0 flex-wrap items-center gap-1.5">
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
                  title={label}
                  variant={state.variant}
                  dietary={key}
                  status={assessment.status}
                  details={
                    <ul className="grid gap-1">
                      {key === "halal" && (
                        <li>{t(halalCertificationLabels[value.halalCertification])}</li>
                      )}
                      {assessment.reasons.map((reason) => (
                        <li key={reason}>
                          {t(
                            reason === "ingredients_confirmed"
                              ? "food_ingredients_checked"
                              : dietaryReasonLabels[reason],
                          )}
                        </li>
                      ))}
                      {key !== "halal" && !assessment.reasons.length && <li>{statusLabel}</li>}
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
              title={t("food_preparation")}
              variant={contactVariant}
              status={value.crossContact}
              details={
                <ul className="grid gap-1">
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

/** 実際のラベル・アイコン幅を使い、食事情報の行とbadgeの形を予約する。 */
export function FoodInformationSkeleton({ caption }: { caption?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className={foodInformationLayout} data-ui="food-information-skeleton">
      <span className="py-0.5 font-medium">{t("food_allergens")}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <Skeleton className="h-6 w-16 rounded-full" />
        {caption && (
          <div className="flex min-h-6 items-center gap-2 text-muted-foreground">{caption}</div>
        )}
      </div>
      <span className="py-0.5 font-medium">{t("food_dietary")}</span>
      <ul className="flex min-w-0 flex-wrap items-start gap-1.5" aria-hidden="true">
        {dietaryKeys.map((key) => {
          const Icon = dietaryIcons[key];
          return (
            <li key={key} className="min-w-0">
              <FoodBadgeSkeleton>
                <Icon />
                {t(key === "vegetarian" ? "food_vegetarian_short" : dietaryLabels[key])}
                <CircleHelp />
              </FoodBadgeSkeleton>
            </li>
          );
        })}
        <li className="min-w-0">
          <FoodBadgeSkeleton>
            <CircleHelp />
            {t("food_preparation")}
          </FoodBadgeSkeleton>
        </li>
      </ul>
    </div>
  );
}

function FoodBadgeSkeleton({ children }: { children: ReactNode }) {
  return (
    <Skeleton className="inline-flex min-h-6 min-w-6 max-w-full rounded-md">
      <Badge variant="inactive" className={`invisible ${foodBadgeClass}`}>
        {children}
      </Badge>
    </Skeleton>
  );
}
