import { productSchema, type Configuration, type Product, type Plan } from "@tablecast/api/schema";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useI18n } from "../../i18n/locale";
import {
  BilingualFields,
  BooleanField,
  NumericField,
  ReferencesField,
  StringListField,
  emptyText,
} from "./configuration-fields";
import { ModifiersEditor } from "./modifiers-editor";

const selectClass = "h-12 rounded-lg border border-input px-3 text-sm";

export function ConfigurationEditor({
  value,
  onChange,
  disabled,
  voices,
}: {
  value: Configuration;
  onChange: (value: Configuration) => void;
  disabled: boolean;
  voices: Configuration["cast"]["voice"][];
}) {
  const { t } = useI18n();
  const [section, setSection] = useState("products");
  return (
    <fieldset className="stacked-form min-w-0 pt-0" disabled={disabled}>
      <label>
        {t("editor_section")}
        <select
          className={selectClass}
          value={section}
          onChange={(event) => {
            if (event.currentTarget.form?.reportValidity()) setSection(event.target.value);
          }}
        >
          <option value="products">{t("editor_products")}</option>
          <option value="categories">{t("editor_categories")}</option>
          <option value="plans">{t("editor_plans")}</option>
          <option value="cast">{t("editor_cast")}</option>
        </select>
      </label>
      {section === "products" && (
        <ProductsEditor value={value} onChange={onChange} disabled={disabled} />
      )}
      {section === "categories" && (
        <CategoriesEditor value={value} onChange={onChange} disabled={disabled} />
      )}
      {section === "plans" && <PlansEditor value={value} onChange={onChange} disabled={disabled} />}
      {section === "cast" && (
        <CastEditor
          value={value.cast}
          voices={voices}
          disabled={disabled}
          onChange={(cast) => onChange({ ...value, cast })}
        />
      )}
    </fieldset>
  );
}

type EditorProps = {
  value: Configuration;
  onChange: (value: Configuration) => void;
  disabled: boolean;
};

function ProductsEditor({ value, onChange, disabled }: EditorProps) {
  const { t, locale } = useI18n();
  const [selectedId, setSelectedId] = useState(value.products[0]?.id ?? "");
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
      <label>
        {t("admin_product")}
        <select
          className={selectClass}
          value={selectedId}
          onChange={(event) => {
            if (event.currentTarget.form?.reportValidity()) setSelectedId(event.target.value);
          }}
        >
          {value.products.map((item) => (
            <option key={item.id} value={item.id}>
              {item.text[locale].displayName || t("editor_new_product")}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          type="button"
          disabled={value.products.length >= 2000}
          onClick={(event) => {
            if (!event.currentTarget.form?.reportValidity()) return;
            const id = crypto.randomUUID();
            onChange({
              ...value,
              products: [
                ...value.products,
                {
                  id,
                  categoryId: value.categories[0]?.id ?? "",
                  text: emptyText(),
                  price: 0,
                  available: false,
                  tags: [],
                  imageKey: null,
                  imageKind: "illustration",
                  modifiers: [],
                  allergens: {
                    contains: [],
                    evidence: "unknown",
                    crossContact: "unknown",
                    vegan: "unknown",
                    note: { ja: "", en: "" },
                  },
                },
              ],
            });
            setSelectedId(id);
          }}
        >
          <Plus size={16} />
          {t("editor_add_product")}
        </Button>
        <Button
          variant="outline"
          type="button"
          disabled={value.products.length <= 1 || !product}
          onClick={() => {
            const products = value.products.filter((item) => item.id !== selectedId);
            onChange({ ...value, products });
            setSelectedId(products[0]?.id ?? "");
          }}
        >
          <Trash2 size={16} />
          {t("editor_remove_product")}
        </Button>
      </div>
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
          <details className="rounded-lg border border-input p-4">
            <summary className="cursor-pointer font-semibold">
              {t("editor_product_details")}
            </summary>
            <div className="stacked-form">
              <label>
                {t("editor_id")}
                <Input value={product.id} readOnly />
              </label>
              <label>
                {t("editor_category")}
                <select
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
                </select>
              </label>
              <StringListField
                label={t("editor_tags")}
                value={product.tags}
                disabled={disabled}
                onChange={(tags) => update({ tags })}
              />
              <label>
                {t("editor_image")}
                <Input
                  maxLength={300}
                  value={product.imageKey ?? ""}
                  onChange={(event) => update({ imageKey: event.target.value || null })}
                />
              </label>
              <label>
                {t("editor_image_kind")}
                <select
                  className={selectClass}
                  value={product.imageKind}
                  onChange={(event) =>
                    update({ imageKind: productSchema.shape.imageKind.parse(event.target.value) })
                  }
                >
                  <option value="illustration">{t("kiosk_illustration")}</option>
                  <option value="photograph">{t("editor_photograph")}</option>
                </select>
              </label>
            </div>
          </details>
          <details className="rounded-lg border border-input p-4">
            <summary className="cursor-pointer font-semibold">{t("kiosk_allergens")}</summary>
            <div className="stacked-form">
              <StringListField
                label={t("editor_contains")}
                value={product.allergens.contains}
                disabled={disabled}
                onChange={(contains) => update({ allergens: { ...product.allergens, contains } })}
              />
              <label>
                {t("editor_evidence")}
                <select
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
                </select>
              </label>
              <label>
                {t("editor_cross_contact")}
                <select
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
                </select>
              </label>
              <label>
                {t("editor_vegan")}
                <select
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
                </select>
              </label>
              {(["ja", "en"] as const).map((language) => (
                <label key={language}>
                  {t("editor_safety_note")} · {t(language === "ja" ? "common_ja" : "common_en")}
                  <textarea
                    className="min-h-24 rounded-lg border border-input p-2 text-sm"
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
          </details>
          <details className="rounded-lg border border-input p-4">
            <summary className="cursor-pointer font-semibold">{t("editor_modifiers")}</summary>
            <div className="pt-5">
              <ModifiersEditor
                key={product.id}
                product={product}
                disabled={disabled}
                onChange={(modifiers) => update({ modifiers })}
              />
            </div>
          </details>
        </>
      )}
    </>
  );
}

function CategoriesEditor({ value, onChange, disabled }: EditorProps) {
  const { t, locale } = useI18n();
  const [selectedId, setSelectedId] = useState(value.categories[0]?.id ?? "");
  const category = value.categories.find((item) => item.id === selectedId);
  return (
    <>
      <label>
        {t("editor_category")}
        <select
          className={selectClass}
          value={selectedId}
          onChange={(event) => {
            if (event.currentTarget.form?.reportValidity()) setSelectedId(event.target.value);
          }}
        >
          {value.categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.text[locale].displayName || t("editor_new_category")}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          type="button"
          disabled={value.categories.length >= 100}
          onClick={(event) => {
            if (!event.currentTarget.form?.reportValidity()) return;
            const id = crypto.randomUUID();
            onChange({ ...value, categories: [...value.categories, { id, text: emptyText() }] });
            setSelectedId(id);
          }}
        >
          <Plus size={16} />
          {t("editor_add_category")}
        </Button>
        <Button
          variant="outline"
          type="button"
          disabled={value.categories.length <= 1 || !category}
          onClick={() => {
            const categories = value.categories.filter((item) => item.id !== selectedId);
            onChange({ ...value, categories });
            setSelectedId(categories[0]?.id ?? "");
          }}
        >
          <Trash2 size={16} />
          {t("editor_remove_category")}
        </Button>
      </div>
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

function PlansEditor({ value, onChange, disabled }: EditorProps) {
  const { t, locale } = useI18n();
  const [selectedId, setSelectedId] = useState(value.plans[0]?.id ?? "");
  const plan = value.plans.find((item) => item.id === selectedId);
  function update(change: Partial<Plan>) {
    onChange({
      ...value,
      plans: value.plans.map((item) => (item.id === selectedId ? { ...item, ...change } : item)),
    });
  }
  return (
    <>
      <label>
        {t("editor_plan")}
        <select
          className={selectClass}
          value={selectedId}
          onChange={(event) => {
            if (event.currentTarget.form?.reportValidity()) setSelectedId(event.target.value);
          }}
        >
          {!value.plans.length && <option value="">{t("admin_no_plan")}</option>}
          {value.plans.map((item) => (
            <option key={item.id} value={item.id}>
              {item.text[locale].displayName || t("editor_new_plan")}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          type="button"
          disabled={value.plans.length >= 30}
          onClick={(event) => {
            if (!event.currentTarget.form?.reportValidity()) return;
            const id = crypto.randomUUID();
            onChange({
              ...value,
              plans: [
                ...value.plans,
                {
                  id,
                  text: emptyText(),
                  pricePerPerson: 0,
                  durationMinutes: 60,
                  lastOrderMinutesBeforeEnd: 10,
                  productIds: [],
                  categoryIds: [],
                  tags: [],
                  maxPerOrder: 1,
                  maxTotalPerPerson: 1,
                  intervalSeconds: 0,
                  excludedOptionIds: [],
                  includedOptionSurcharge: false,
                },
              ],
            });
            setSelectedId(id);
          }}
        >
          <Plus size={16} />
          {t("editor_add_plan")}
        </Button>
        <Button
          variant="outline"
          type="button"
          disabled={!plan}
          onClick={() => {
            const plans = value.plans.filter((item) => item.id !== selectedId);
            onChange({ ...value, plans });
            setSelectedId(plans[0]?.id ?? "");
          }}
        >
          <Trash2 size={16} />
          {t("editor_remove_plan")}
        </Button>
      </div>
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
  value,
  voices,
  onChange,
  disabled,
}: {
  value: Configuration["cast"];
  voices: Configuration["cast"]["voice"][];
  onChange: (value: Configuration["cast"]) => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  return (
    <>
      {(["ja", "en"] as const).map((language) => (
        <fieldset key={language} className="stacked-form pt-0">
          <legend className="mb-3 font-semibold">
            {t(language === "ja" ? "common_ja" : "common_en")}
          </legend>
          <label>
            {t("editor_cast_instructions")}
            <textarea
              className="min-h-40 rounded-lg border border-input p-2 text-sm"
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
          <label>
            {t("editor_voice")}
            <select
              className={selectClass}
              value={value.voice[language] ?? ""}
              onChange={(event) =>
                onChange({
                  ...value,
                  voice: { ...value.voice, [language]: event.target.value || null },
                })
              }
            >
              <option value="">{t("editor_not_configured")}</option>
              {[...new Set([...voices.map((voice) => voice[language]), value.voice[language]])]
                .filter((voice) => voice !== null)
                .map((voice) => (
                  <option key={voice} value={voice}>
                    {voice}
                  </option>
                ))}
            </select>
          </label>
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
