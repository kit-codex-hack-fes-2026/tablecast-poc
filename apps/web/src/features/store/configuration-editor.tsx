import { productSchema, type Configuration, type Plan, type Product } from "@tablecast/api/schema";
import {
  BadgeJapaneseYen,
  Clock,
  Image,
  Info,
  Languages,
  ListFilter,
  MessageSquare,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { useId } from "react";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";

import {
  BilingualFields,
  ConfigurationSection,
  BooleanField,
  NumericField,
  ReferencesField,
  StringListField,
} from "./configuration-fields";
import { ConfigurationImageField, type ImageStagedChange } from "./configuration-image-field";
import { ModifiersEditor } from "./modifiers-editor";
import { StandardVoiceSelect } from "./standard-voice-select";

const selectClass = "h-12 rounded-lg border border-input px-3 text-base";

type EditorProps = {
  value: Configuration;
  onChange: (value: Configuration) => void;
  disabled: boolean;
  selectedId: string;
};

export function ProductsEditor({
  storeId,
  value,
  onChange,
  disabled,
  selectedId,
  onImageStagedChange,
}: EditorProps & { storeId: string; onImageStagedChange?: ImageStagedChange }) {
  const { t, locale } = useI18n();
  const product = value.products.find((item) => item.id === selectedId);
  function update(change: Partial<Product>) {
    onChange({
      ...value,
      products: value.products.map((item) =>
        item.id === selectedId ? { ...item, ...change } : item,
      ),
    });
  }
  return (
    <>
      {product && (
        <>
          <ConfigurationSection title={t("editor_basic_information")} icon={Info}>
            <div className="grid min-w-0 gap-4 @xl:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm">
                {t("editor_id")}
                <Input value={product.id} readOnly />
              </label>
              <label className="flex flex-col gap-2 text-sm">
                {t("editor_category")}
                <NativeSelect
                  className={selectClass}
                  value={product.categoryId}
                  onChange={(event) => update({ categoryId: event.target.value })}
                >
                  {!value.categories.some((item) => item.id === product.categoryId) && (
                    <option value={product.categoryId}>
                      {product.categoryId} · {t("editor_missing_reference")}
                    </option>
                  )}
                  {value.categories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.text[locale].displayName}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <StringListField
                label={t("editor_tags")}
                value={product.tags}
                disabled={disabled}
                onChange={(tags) => update({ tags })}
              />
            </div>
          </ConfigurationSection>
          <ConfigurationSection title={t("editor_pricing_availability")} icon={BadgeJapaneseYen}>
            <div className="grid min-w-0 items-end gap-4 @xl:grid-cols-2">
              <NumericField
                label={t("admin_unit_price")}
                value={product.price}
                min={0}
                max={10_000_000}
                disabled={disabled}
                onChange={(price) => update({ price })}
              />
              <BooleanField
                label={t("admin_available")}
                value={product.available}
                disabled={disabled}
                onChange={(available) => update({ available })}
              />
            </div>
          </ConfigurationSection>
          <ConfigurationSection title={t("editor_translation")} icon={Languages}>
            <BilingualFields
              value={product.text}
              disabled={disabled}
              onChange={(text) => update({ text })}
            />
          </ConfigurationSection>
          <ConfigurationSection title={t("editor_images")} icon={Image}>
            <ConfigurationImageField
              key={`${storeId}:${product.id}`}
              storeId={storeId}
              value={product}
              onChange={update}
              onStagedChange={onImageStagedChange}
              disabled={disabled}
            />
          </ConfigurationSection>
          <ConfigurationSection title={t("kiosk_allergens")} icon={ShieldCheck}>
            <div className="grid min-w-0 gap-4 @xl:grid-cols-2">
              <StringListField
                label={t("editor_contains")}
                value={product.allergens.contains}
                disabled={disabled}
                onChange={(contains) => update({ allergens: { ...product.allergens, contains } })}
              />
              <label className="flex flex-col gap-2 text-sm">
                {t("editor_evidence")}
                <NativeSelect
                  className={selectClass}
                  value={product.allergens.evidence}
                  onChange={(event) =>
                    update({
                      allergens: {
                        ...product.allergens,
                        evidence: productSchema.shape.allergens.shape.evidence.parse(
                          event.target.value,
                        ),
                      },
                    })
                  }
                >
                  <option value="unknown">{t("editor_unknown")}</option>
                  <option value="verified">{t("editor_verified")}</option>
                </NativeSelect>
              </label>
              <label className="flex flex-col gap-2 text-sm">
                {t("editor_cross_contact")}
                <NativeSelect
                  className={selectClass}
                  value={product.allergens.crossContact}
                  onChange={(event) =>
                    update({
                      allergens: {
                        ...product.allergens,
                        crossContact: productSchema.shape.allergens.shape.crossContact.parse(
                          event.target.value,
                        ),
                      },
                    })
                  }
                >
                  <option value="unknown">{t("editor_unknown")}</option>
                  <option value="possible">{t("editor_possible")}</option>
                  <option value="controlled">{t("editor_controlled")}</option>
                </NativeSelect>
              </label>
              <label className="flex flex-col gap-2 text-sm">
                {t("editor_vegan")}
                <NativeSelect
                  className={selectClass}
                  value={product.allergens.vegan}
                  onChange={(event) =>
                    update({
                      allergens: {
                        ...product.allergens,
                        vegan: productSchema.shape.allergens.shape.vegan.parse(event.target.value),
                      },
                    })
                  }
                >
                  <option value="unknown">{t("editor_unknown")}</option>
                  <option value="yes">{t("editor_yes")}</option>
                  <option value="no">{t("editor_no")}</option>
                </NativeSelect>
              </label>
              {(["ja", "en"] as const).map((language) => (
                <label className="flex flex-col gap-2 text-sm" key={language}>
                  {t("editor_safety_note")} · {t(language === "ja" ? "common_ja" : "common_en")}
                  <textarea
                    className="min-h-24 rounded-lg border border-input p-2 text-base"
                    value={product.allergens.note[language]}
                    onChange={(event) =>
                      update({
                        allergens: {
                          ...product.allergens,
                          note: { ...product.allergens.note, [language]: event.target.value },
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </ConfigurationSection>
          <ConfigurationSection title={t("editor_modifiers")} icon={SlidersHorizontal}>
            <ModifiersEditor
              onImageStagedChange={onImageStagedChange}
              storeId={storeId}
              key={product.id}
              product={product}
              disabled={disabled}
              onChange={(modifiers) => update({ modifiers })}
            />
          </ConfigurationSection>
        </>
      )}
    </>
  );
}

export function CategoriesEditor({ value, onChange, disabled, selectedId }: EditorProps) {
  const { t } = useI18n();
  const category = value.categories.find((item) => item.id === selectedId);
  return (
    <>
      {category && (
        <>
          <ConfigurationSection title={t("editor_basic_information")} icon={Info}>
            <label className="grid gap-2 text-sm">
              {t("editor_id")}
              <Input readOnly value={category.id} />
            </label>
          </ConfigurationSection>
          <ConfigurationSection title={t("editor_translation")} icon={Languages}>
            <BilingualFields
              value={category.text}
              disabled={disabled}
              onChange={(text) =>
                onChange({
                  ...value,
                  categories: value.categories.map((item) =>
                    item.id === selectedId ? { ...item, text } : item,
                  ),
                })
              }
            />
          </ConfigurationSection>
        </>
      )}
    </>
  );
}

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
          <ConfigurationSection title={t("editor_basic_information")} icon={Info}>
            <label className="grid gap-2 text-sm">
              {t("editor_id")}
              <Input readOnly value={plan.id} />
            </label>
          </ConfigurationSection>
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

export function CastEditor({
  storeId,
  value,
  voices,
  onChange,
  disabled,
}: {
  storeId: string;
  value: Configuration["cast"];
  voices: Configuration["cast"]["voice"][];
  onChange: (value: Configuration["cast"]) => void;
  disabled: boolean;
}) {
  const id = useId();
  const { t } = useI18n();
  return (
    <ConfigurationSection title={t("editor_cast_instructions")} icon={MessageSquare}>
      <div className="grid min-w-0 gap-6 @2xl:grid-cols-2">
        {(["ja", "en"] as const).map((language) => (
          <fieldset key={language} className="flex min-w-0 flex-col gap-4 pt-0" disabled={disabled}>
            <legend id={`${id}-${language}`} className="mb-3 font-semibold">
              {t(language === "ja" ? "common_ja" : "common_en")}
            </legend>
            <label className="flex flex-col gap-2 text-sm">
              <span id={`${id}-${language}-instructions`}>{t("editor_cast_instructions")}</span>
              <textarea
                className="min-h-40 rounded-lg border border-input p-2 text-base"
                aria-labelledby={`${id}-${language} ${id}-${language}-instructions`}
                maxLength={5000}
                value={value.instructions[language]}
                onChange={(event) =>
                  onChange({
                    ...value,
                    instructions: { ...value.instructions, [language]: event.target.value },
                  })
                }
              />
            </label>
            <StandardVoiceSelect
              storeId={storeId}
              language={language}
              labelledBy={`${id}-${language}`}
              value={value.voice[language]}
              retained={voices.map((voice) => voice[language])}
              disabled={disabled}
              onChange={(voiceId) =>
                onChange({ ...value, voice: { ...value.voice, [language]: voiceId } })
              }
            />
          </fieldset>
        ))}
      </div>
      <BooleanField
        label={t("editor_proactive")}
        value={value.proactive}
        disabled={disabled}
        onChange={(proactive) => onChange({ ...value, proactive })}
      />
    </ConfigurationSection>
  );
}
