import {
  crossContactSourceSchema,
  dietaryAssessmentSchema,
  dietaryKeys,
  dietaryReasonsByKind,
  foodClassification,
  type FoodProfile,
  foodProfileSchema,
  halalCertificationSchema,
} from "@tablecast/api/schema";
import {
  CircleCheck,
  CircleHelp,
  CircleMinus,
  CircleX,
  Droplets,
  Factory,
  Leaf,
  MoonStar,
  ShieldCheck,
  Sprout,
  TriangleAlert,
  UtensilsCrossed,
  WheatOff,
} from "lucide-react";
import {
  allergenEmoji,
  crossContactSourceLabels,
  dietaryLabels,
  dietaryReasonLabels,
  foodStatusLabels,
  halalCertificationLabels,
} from "../../components/food-information-model";
import { badgeVariants } from "../../components/ui/badge-variants";
import { Checkbox } from "../../components/ui/checkbox";
import { NativeSelect } from "../../components/ui/native-select";
import { Select, SelectContent, SelectItem, SelectTrigger } from "../../components/ui/select";
import { useI18n } from "../../i18n/locale";

const allergenStates = {
  contains: { icon: TriangleAlert, variant: "destructive", label: "food_contains" },
  not_used: { icon: CircleMinus, variant: "outline", label: "food_not_used_short" },
  unknown: { icon: CircleHelp, variant: "warning", label: "food_unknown" },
} as const;
const contactStates = {
  possible: { icon: TriangleAlert, variant: "warning" },
  unknown: { icon: CircleHelp, variant: "inactive" },
  controlled: { icon: ShieldCheck, variant: "success" },
} as const;
const dietaryStates = {
  yes: { icon: CircleCheck, variant: "success" },
  no: { icon: CircleX, variant: "destructive" },
  unknown: { icon: CircleHelp, variant: "inactive" },
} as const;
const dietaryIcons = { vegan: Leaf, vegetarian: Sprout, halal: MoonStar, glutenFree: WheatOff };
const sourceIcons = {
  shared_equipment: UtensilsCrossed,
  shared_frying_oil: Droplets,
  shared_production_line: Factory,
};

export function FoodProfileEditor({
  value,
  onChange,
  disabled,
}: {
  disabled: boolean;
  onChange: (value: FoodProfile) => void;
  value: FoodProfile;
}) {
  const { t, locale } = useI18n();
  const contact = contactStates[value.crossContact];
  const ContactIcon = contact.icon;
  const sources = new Set(value.crossContactSources);
  const reasons = new Map(dietaryKeys.map((key) => [key, new Set(value.dietary[key].reasons)]));
  return (
    <div className="@container/food-profile grid gap-3" data-ui="food-profile-editor">
      <section
        className="grid gap-4 rounded-xl border border-border p-3"
        aria-label={t("food_allergens")}
      >
        {(["required", "recommended"] as const).map((category) => (
          <fieldset key={category}>
            <legend className="mb-2 text-sm font-semibold">
              {t(category === "required" ? "food_required" : "food_recommended")}
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {foodClassification.allergens
                .filter((item) => item.category === category)
                .map((item) => {
                  const status = value.allergens[item.id] ?? "unknown";
                  const state = allergenStates[status];
                  const Icon = state.icon;
                  return (
                    <Select
                      key={item.id}
                      value={status}
                      disabled={disabled}
                      onValueChange={(next) => {
                        if (next)
                          onChange({
                            ...value,
                            allergens: {
                              ...value.allergens,
                              [item.id]: foodProfileSchema.shape.allergens.valueType.parse(next),
                            },
                          });
                      }}
                    >
                      <SelectTrigger
                        aria-label={item.name[locale]}
                        aria-description={t(state.label)}
                        title={`${item.name[locale]}: ${t(state.label)}`}
                        className={badgeVariants({
                          variant: state.variant,
                          class:
                            "min-h-11 w-fit gap-1.5 rounded-full bg-none px-3 py-1.5 text-sm shadow-none",
                        })}
                      >
                        <span aria-hidden="true">{allergenEmoji[item.id]}</span>
                        <span>{item.name[locale]}</span>
                        <Icon className="size-3.5" aria-hidden="true" />
                        <span className="sr-only">{t(state.label)}</span>
                      </SelectTrigger>
                      <SelectContent>
                        {(["contains", "not_used", "unknown"] as const).map((option) => {
                          const OptionIcon = allergenStates[option].icon;
                          return (
                            <SelectItem key={option} value={option}>
                              <span className="flex items-center gap-2">
                                <OptionIcon className="size-4" aria-hidden="true" />
                                {t(allergenStates[option].label)}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  );
                })}
            </div>
          </fieldset>
        ))}
      </section>
      <div className="grid items-start gap-3 @min-[38rem]/food-profile:grid-cols-2">
        {dietaryKeys.map((key) => {
          const state = dietaryStates[value.dietary[key].status];
          const Icon = dietaryIcons[key];
          const StatusIcon = state.icon;
          return (
            <fieldset key={key} className="grid min-w-0 gap-2 rounded-xl border border-border p-3">
              <legend className="sr-only">{t(dietaryLabels[key])}</legend>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className="inline-flex items-center gap-2 text-sm font-semibold"
                  aria-hidden="true"
                >
                  <Icon className="size-4" />
                  {t(dietaryLabels[key])}
                </span>
                <div className="flex items-center gap-1.5">
                  <StatusIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                  <NativeSelect
                    disabled={disabled}
                    aria-label={t("food_suitability")}
                    className={badgeVariants({
                      variant: state.variant,
                      class: "min-h-11 rounded-md py-1.5 text-sm shadow-none",
                    })}
                    value={value.dietary[key].status}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        dietary: {
                          ...value.dietary,
                          [key]: {
                            ...value.dietary[key],
                            status: dietaryAssessmentSchema.shape.status.parse(event.target.value),
                          },
                        },
                      })
                    }
                  >
                    {(["unknown", "yes", "no"] as const).map((status) => (
                      <option value={status} key={status}>
                        {t(status === "unknown" ? "food_unknown" : foodStatusLabels[status])}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
              {key === "halal" && (
                <label className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-xs font-medium">
                  {t("food_halal_certification")}
                  <NativeSelect
                    disabled={disabled}
                    value={value.halalCertification}
                    className="min-h-11 py-1.5 text-sm"
                    onChange={(event) =>
                      onChange({
                        ...value,
                        halalCertification: foodProfileSchema.shape.halalCertification.parse(
                          event.target.value,
                        ),
                      })
                    }
                  >
                    {halalCertificationSchema.options.map((status) => (
                      <option key={status} value={status}>
                        {t(halalCertificationLabels[status])}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              )}
              <fieldset className="border-t border-border pt-2">
                <legend className="pt-1 text-xs font-medium text-muted-foreground">
                  {t("food_reasons")}
                </legend>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {dietaryReasonsByKind[key].map((reason) => {
                    const checked = reasons.get(key)?.has(reason) ?? false;
                    return (
                      <label
                        key={reason}
                        className={badgeVariants({
                          variant: checked ? state.variant : "outline",
                          class: "min-h-11 justify-start gap-2 rounded-lg px-2 py-1 text-xs",
                        })}
                      >
                        <Checkbox
                          disabled={disabled}
                          checked={checked}
                          className="size-4"
                          onCheckedChange={(included) =>
                            onChange({
                              ...value,
                              dietary: {
                                ...value.dietary,
                                [key]: {
                                  ...value.dietary[key],
                                  reasons: included
                                    ? [...value.dietary[key].reasons, reason]
                                    : value.dietary[key].reasons.filter((item) => item !== reason),
                                },
                              },
                            })
                          }
                        />
                        {t(dietaryReasonLabels[reason])}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </fieldset>
          );
        })}
      </div>
      <fieldset className="grid gap-2 rounded-xl border border-border p-3">
        <legend className="sr-only">{t("food_contact_sources")}</legend>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-sm font-semibold" aria-hidden="true">
            <ShieldCheck className="size-4" />
            {t("food_contact_sources")}
          </span>
          <div className="flex items-center gap-1.5">
            <ContactIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            <NativeSelect
              disabled={disabled}
              aria-label={t("editor_cross_contact")}
              value={value.crossContact}
              className={badgeVariants({
                variant: contact.variant,
                class: "min-h-11 rounded-md py-1.5 text-sm shadow-none",
              })}
              onChange={(event) =>
                onChange({
                  ...value,
                  crossContact: foodProfileSchema.shape.crossContact.parse(event.target.value),
                })
              }
            >
              {(["unknown", "possible", "controlled"] as const).map((status) => (
                <option key={status} value={status}>
                  {t(foodStatusLabels[status])}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {crossContactSourceSchema.options.map((source) => {
            const Icon = sourceIcons[source];
            return (
              <label
                key={source}
                className={badgeVariants({
                  variant: sources.has(source) ? "secondary" : "outline",
                  class: "min-h-11 justify-start gap-2 rounded-lg px-3 py-1.5 text-sm",
                })}
              >
                <Checkbox
                  disabled={disabled}
                  checked={sources.has(source)}
                  className="size-4"
                  onCheckedChange={(checked) =>
                    onChange({
                      ...value,
                      crossContactSources: checked
                        ? [...value.crossContactSources, source]
                        : value.crossContactSources.filter((item) => item !== source),
                    })
                  }
                />
                <Icon className="size-4" aria-hidden="true" />
                {t(crossContactSourceLabels[source])}
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
