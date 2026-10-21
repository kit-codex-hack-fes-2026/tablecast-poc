import { type Plan } from "@tablecast/api/schema";
import { Clock, Languages, ListFilter, SlidersHorizontal } from "lucide-react";
import type { EditorProps } from "../configuration/configuration-editor-model";
import { useI18n } from "../../i18n/locale";
import {
  BilingualFields,
  BooleanField,
  ConfigurationSection,
  NumericField,
  ReferencesField,
  StringListField,
} from "../configuration/configuration-fields";

export function PlansEditor({ value, onChange, disabled, selectedId }: EditorProps) {
  const { t, locale } = useI18n();
  const plan = value.plans.find((item) => item.id === selectedId);
  function update(change: Partial<Plan>) {
    onChange({
      ...value,
      plans: value.plans.map((item) => (item.id === selectedId ? { ...item, ...change } : item)),
    });
  }
  return (
    <>
      {plan && (
        <>
          <ConfigurationSection title={t("editor_translation")} icon={Languages}>
            <BilingualFields
              value={plan.text}
              disabled={disabled}
              onChange={(text) => update({ text })}
            />
          </ConfigurationSection>
          <ConfigurationSection title={t("editor_pricing_duration")} icon={Clock}>
            <div className="grid min-w-0 gap-4 @xl:grid-cols-2">
              <NumericField
                label={t("editor_plan_price")}
                value={plan.pricePerPerson}
                min={0}
                max={10_000_000}
                onChange={(pricePerPerson) => update({ pricePerPerson })}
              />
              <NumericField
                label={t("editor_duration")}
                value={plan.durationMinutes}
                min={1}
                max={1440}
                onChange={(durationMinutes) => update({ durationMinutes })}
              />
              <NumericField
                label={t("editor_last_order")}
                value={plan.lastOrderMinutesBeforeEnd}
                min={0}
                onChange={(lastOrderMinutesBeforeEnd) => update({ lastOrderMinutesBeforeEnd })}
              />
            </div>
          </ConfigurationSection>
          <ConfigurationSection title={t("editor_order_limits")} icon={SlidersHorizontal}>
            <div className="grid min-w-0 gap-4 @xl:grid-cols-2">
              <NumericField
                label={t("editor_max_order")}
                value={plan.maxPerOrder}
                min={1}
                max={100}
                onChange={(maxPerOrder) => update({ maxPerOrder })}
              />
              <NumericField
                label={t("editor_max_person")}
                value={plan.maxTotalPerPerson}
                min={1}
                max={1000}
                onChange={(maxTotalPerPerson) => update({ maxTotalPerPerson })}
              />
              <NumericField
                label={t("editor_interval")}
                value={plan.intervalSeconds}
                min={0}
                max={3600}
                onChange={(intervalSeconds) => update({ intervalSeconds })}
              />
            </div>
          </ConfigurationSection>
          <ConfigurationSection title={t("editor_plan_scope")} icon={ListFilter}>
            <div className="grid min-w-0 gap-4 @xl:grid-cols-2">
              <ReferencesField
                label={t("editor_included_products")}
                value={plan.productIds}
                options={value.products.map((item) => ({
                  id: item.id,
                  label: item.text[locale].displayName,
                }))}
                onChange={(productIds) => update({ productIds })}
              />
              <ReferencesField
                label={t("editor_included_categories")}
                value={plan.categoryIds}
                options={value.categories.map((item) => ({
                  id: item.id,
                  label: item.text[locale].displayName,
                }))}
                onChange={(categoryIds) => update({ categoryIds })}
              />
              <StringListField
                label={t("editor_included_tags")}
                value={plan.tags}
                onChange={(tags) => update({ tags })}
              />
              <ReferencesField
                label={t("editor_excluded_options")}
                value={plan.excludedOptionIds}
                options={value.products.flatMap((item) =>
                  item.modifiers.flatMap((modifier) =>
                    modifier.options.map((option) => ({
                      id: option.id,
                      label: `${item.text[locale].displayName} · ${modifier.text[locale].displayName} · ${option.text[locale].displayName}`,
                    })),
                  ),
                )}
                onChange={(excludedOptionIds) => update({ excludedOptionIds })}
              />
            </div>
            <BooleanField
              label={t("editor_option_surcharge")}
              value={plan.includedOptionSurcharge}
              disabled={disabled}
              onChange={(includedOptionSurcharge) => update({ includedOptionSurcharge })}
            />
          </ConfigurationSection>
        </>
      )}
    </>
  );
}
