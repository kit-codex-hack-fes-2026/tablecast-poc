import { productSchema, type Configuration, type Plan, type Product } from "@tablecast/api/schema";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";

import {
  BilingualFields,
  BooleanField,
  NumericField,
  ReferencesField,
  StringListField,
} from "./configuration-fields";
import { ModifiersEditor } from "./modifiers-editor";
import { StandardVoiceSelect } from "./standard-voice-select";

const selectClass = "h-12 rounded-lg border border-input px-3 text-base";

type EditorProps = {
  value: Configuration;
  onChange: (value: Configuration) => void;
  disabled: boolean;
  selectedId: string;
};

export function ProductsEditor({ value, onChange, disabled, selectedId }: EditorProps) {
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
          <BilingualFields
            value={product.text}
            disabled={disabled}
            onChange={(text) => update({ text })}
          />
          <section className="rounded-lg border border-input p-4">
            <h2 className="font-semibold">{t("editor_product_details")}</h2>
            <div className="flex flex-col gap-4 pt-6">
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
              <label className="flex flex-col gap-2 text-sm">
                {t("editor_image")}
                <Input
                  maxLength={300}
                  value={product.imageKey ?? ""}
                  onChange={(event) => update({ imageKey: event.target.value || null })}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm">
                {t("editor_image_kind")}
                <NativeSelect
                  className={selectClass}
                  value={product.imageKind}
                  onChange={(event) =>
                    update({ imageKind: productSchema.shape.imageKind.parse(event.target.value) })
                  }
                >
                  <option value="illustration">{t("kiosk_illustration")}</option>
                  <option value="photograph">{t("editor_photograph")}</option>
                </NativeSelect>
              </label>
            </div>
          </section>
          <section className="rounded-lg border border-input p-4">
            <h2 className="font-semibold">{t("kiosk_allergens")}</h2>
            <div className="flex flex-col gap-4 pt-6">
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
          </section>
          <section className="rounded-lg border border-input p-4">
            <h2 className="font-semibold">{t("editor_modifiers")}</h2>
            <div className="pt-5">
              <ModifiersEditor
                key={product.id}
                product={product}
                disabled={disabled}
                onChange={(modifiers) => update({ modifiers })}
              />
            </div>
          </section>
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
          <label>
            {t("editor_id")}
            <Input readOnly value={category.id} />
          </label>
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
          <label>
            {t("editor_id")}
            <Input readOnly value={plan.id} />
          </label>
          <BilingualFields
            value={plan.text}
            disabled={disabled}
            onChange={(text) => update({ text })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
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
          <BooleanField
            label={t("editor_option_surcharge")}
            value={plan.includedOptionSurcharge}
            disabled={disabled}
            onChange={(includedOptionSurcharge) => update({ includedOptionSurcharge })}
          />
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
  const { t } = useI18n();
  return (
    <>
      {(["ja", "en"] as const).map((language) => (
        <fieldset key={language} className="flex flex-col gap-4 pt-0">
          <legend className="mb-3 font-semibold">
            {t(language === "ja" ? "common_ja" : "common_en")}
          </legend>
          <label className="flex flex-col gap-2 text-sm">
            {t("editor_cast_instructions")}
            <textarea
              className="min-h-40 rounded-lg border border-input p-2 text-base"
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
            value={value.voice[language]}
            retained={voices.map((voice) => voice[language])}
            disabled={disabled}
            onChange={(voiceId) =>
              onChange({ ...value, voice: { ...value.voice, [language]: voiceId } })
            }
          />
        </fieldset>
      ))}
      <BooleanField
        label={t("editor_proactive")}
        value={value.proactive}
        disabled={disabled}
        onChange={(proactive) => onChange({ ...value, proactive })}
      />
    </>
  );
}
