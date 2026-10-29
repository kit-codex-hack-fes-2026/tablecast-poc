import {
  dietaryAssessmentSchema,
  dietaryKeys,
  foodClassification,
  type FoodProfile,
  foodProfileSchema,
} from "@tablecast/api/schema";
import { useId } from "react";
import { dietaryLabels, foodStatusLabels } from "../../components/food-information-model";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { StringListField } from "../configuration/configuration-fields";
import { LanguageFields } from "../configuration/language-fields";

function FoodBasisEditor({
  value,
  onChange,
  disabled,
  label,
  required = false,
}: {
  disabled: boolean;
  label: string;
  onChange: (value: FoodProfile["basis"]) => void;
  required?: boolean;
  value: FoodProfile["basis"];
}) {
  const id = useId();
  return (
    <LanguageFields>
      {(language, languageLabelId) => (
        <label className="grid gap-2 text-sm">
          <span id={`${id}-${language}`}>{label}</span>
          <textarea
            aria-labelledby={`${languageLabelId} ${id}-${language}`}
            lang={language}
            disabled={disabled}
            required={required}
            aria-invalid={required && !value[language].trim()}
            className="min-h-20 w-full rounded-lg border border-input bg-background p-3 text-base"
            value={value[language]}
            onChange={(event) => onChange({ ...value, [language]: event.target.value })}
          />
        </label>
      )}
    </LanguageFields>
  );
}

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
  return (
    <div className="grid gap-5">
      {(["required", "recommended"] as const).map((category) => (
        <fieldset key={category} className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-3 font-medium">
            {t(category === "required" ? "food_required" : "food_recommended")}
          </legend>
          {foodClassification.allergens
            .filter((item) => item.category === category)
            .map((item) => (
              <label key={item.id} className="grid gap-2 text-sm">
                {item.name[locale]}
                <NativeSelect
                  disabled={disabled}
                  value={value.allergens[item.id] ?? "unknown"}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      allergens: {
                        ...value.allergens,
                        [item.id]: foodProfileSchema.shape.allergens.valueType.parse(
                          event.target.value,
                        ),
                      },
                    })
                  }
                >
                  {(["unknown", "contains", "not_used"] as const).map((status) => (
                    <option value={status} key={status}>
                      {t(foodStatusLabels[status])}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            ))}
        </fieldset>
      ))}
      <StringListField
        label={t("food_other_allergens")}
        value={value.otherAllergens}
        onChange={(otherAllergens) => onChange({ ...value, otherAllergens })}
        disabled={disabled}
      />
      <FoodBasisEditor
        required={
          value.crossContact !== "unknown" ||
          value.otherAllergens.length > 0 ||
          Object.values(value.allergens).some((status) => status !== "unknown")
        }
        value={value.basis}
        label={t("food_basis")}
        disabled={disabled}
        onChange={(basis) => onChange({ ...value, basis })}
      />
      <label className="grid gap-2 text-sm">
        {t("editor_cross_contact")}
        <NativeSelect
          disabled={disabled}
          value={value.crossContact}
          onChange={(event) =>
            onChange({
              ...value,
              crossContact: foodProfileSchema.shape.crossContact.parse(event.target.value),
            })
          }
        >
          {(["unknown", "possible", "controlled"] as const).map((status) => (
            <option value={status} key={status}>
              {t(foodStatusLabels[status])}
            </option>
          ))}
        </NativeSelect>
      </label>
      {dietaryKeys.map((key) => (
        <fieldset key={key} className="grid gap-3">
          <legend className="mb-3 font-medium">{t(dietaryLabels[key])}</legend>
          <label className="grid gap-2 text-sm">
            {t("food_suitability")}
            <NativeSelect
              disabled={disabled}
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
                  {t(foodStatusLabels[status])}
                </option>
              ))}
            </NativeSelect>
          </label>
          <FoodBasisEditor
            required={value.dietary[key].status !== "unknown"}
            label={t("food_basis")}
            value={value.dietary[key].basis}
            disabled={disabled}
            onChange={(basis) =>
              onChange({
                ...value,
                dietary: { ...value.dietary, [key]: { ...value.dietary[key], basis } },
              })
            }
          />
        </fieldset>
      ))}
    </div>
  );
}
