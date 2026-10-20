import {
  localeSchema,
  productSchema,
  type Configuration,
  type Locale,
  type Plan,
  type Product,
} from "@tablecast/api/schema";
import {
  AudioLines,
  Clock,
  Image,
  Info,
  Languages,
  ListFilter,
  MessageSquare,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { LanguageFields } from "./language-fields";
import type { CastTarget } from "./menu-model";
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
import { PromptEditor } from "./prompt-editor";
import { StandardVoiceSelect } from "./standard-voice-select";

const selectClass = "h-12 rounded-lg border border-input px-3 text-base";

type EditorProps = {
  value: Configuration;
  onChange: React.Dispatch<React.SetStateAction<Configuration>>;
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
    onChange((current) => ({
      ...current,
      products: current.products.map((item) =>
        item.id === selectedId ? { ...item, ...change } : item,
      ),
    }));
  }
  return (
    <>
      {product && (
        <>
          <nav
            className="flex flex-wrap gap-2 rounded-xl bg-secondary/60 p-2 text-sm"
            aria-label={t("editor_product_identity")}
          >
            {(
              [
                ["product-basics", "editor_basic_information"],
                ["product-customisation", "editor_modifiers"],
                ["product-content", "editor_product_content"],
              ] as const
            ).map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium hover:bg-secondary"
              >
                {t(label)}
              </a>
            ))}
          </nav>
          <ConfigurationSection id="product-basics" title={t("editor_product_basics")} icon={Info}>
            <div className="grid min-w-0 gap-4 @xl:grid-cols-2">
              <div className="col-span-full">
                <LanguageFields>
                  {(language, languageLabelId) => (
                    <label className="grid gap-2 text-sm">
                      <span id={`product-name-${language}`}>{t("admin_display_name")}</span>
                      <Input
                        aria-labelledby={`${languageLabelId} product-name-${language}`}
                        lang={language}
                        required
                        maxLength={150}
                        disabled={disabled}
                        value={product.text[language].displayName}
                        onChange={(event) =>
                          update({
                            text: {
                              ...product.text,
                              [language]: {
                                ...product.text[language],
                                displayName: event.target.value,
                              },
                            },
                          })
                        }
                      />
                    </label>
                  )}
                </LanguageFields>
              </div>
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
              <label className="grid gap-2 text-sm">
                {t("editor_category")}
                <NativeSelect
                  className={selectClass}
                  disabled={disabled}
                  value={product.categoryId}
                  onChange={(event) => update({ categoryId: event.target.value })}
                >
                  {!value.categories.some((item) => item.id === product.categoryId) && (
                    <option value={product.categoryId}>{t("editor_missing_reference")}</option>
                  )}
                  {value.categories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.text[locale].displayName}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            </div>
            <StringListField
              label={t("editor_tags")}
              value={product.tags}
              disabled={disabled}
              onChange={(tags) => update({ tags })}
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
          <ConfigurationSection
            id="product-customisation"
            title={t("editor_modifiers")}
            icon={SlidersHorizontal}
          >
            <ModifiersEditor
              onImageStagedChange={onImageStagedChange}
              storeId={storeId}
              key={product.id}
              product={product}
              disabled={disabled}
              onChange={(modifiers) =>
                onChange((current) => ({
                  ...current,
                  products: current.products.map((item) =>
                    item.id === selectedId
                      ? {
                          ...item,
                          modifiers:
                            typeof modifiers === "function" ? modifiers(item.modifiers) : modifiers,
                        }
                      : item,
                  ),
                }))
              }
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
              <div className="col-span-full">
                <LanguageFields>
                  {(language, languageLabelId) => (
                    <label className="grid gap-2 text-sm">
                      <span id={`safety-note-${language}`}>{t("editor_safety_note")}</span>
                      <textarea
                        aria-labelledby={`${languageLabelId} safety-note-${language}`}
                        lang={language}
                        disabled={disabled}
                        className="field-sizing-content min-h-24 w-full resize-y rounded-lg border border-input bg-background p-3 text-base"
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
                  )}
                </LanguageFields>
              </div>
            </div>
          </ConfigurationSection>
          <ConfigurationSection
            id="product-content"
            title={t("editor_product_content")}
            icon={Languages}
          >
            <BilingualFields
              includeName={false}
              value={product.text}
              disabled={disabled}
              onChange={(text) => update({ text })}
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
  focusTarget,
}: {
  storeId: string;
  value: Configuration["cast"];
  voices: Configuration["cast"]["voice"][];
  onChange: (value: Configuration["cast"]) => void;
  disabled: boolean;
  focusTarget?: CastTarget;
}) {
  const id = useId();
  const { t, locale } = useI18n();
  const targetLanguage = localeSchema.options.find((language) =>
    focusTarget?.endsWith(`-${language}`),
  );
  const [selection, setSelection] = useState({
    target: focusTarget,
    language: targetLanguage ?? locale,
  });
  const language =
    selection.target === focusTarget ? selection.language : (targetLanguage ?? selection.language);
  const focusedTarget = useRef<CastTarget | undefined>(undefined);
  useEffect(() => {
    if (!focusTarget || focusedTarget.current === focusTarget) return;
    document.getElementById(`${id}-${focusTarget}`)?.focus();
    focusedTarget.current = focusTarget;
  }, [focusTarget, id]);
  return (
    <div className="min-w-0 space-y-6">
      <LanguageFields
        value={language}
        onValueChange={(next: Locale) => setSelection({ target: focusTarget, language: next })}
      >
        {(itemLanguage, languageLabelId) => (
          <>
            <ConfigurationSection
              title={t("editor_cast_instructions")}
              icon={MessageSquare}
              headingId={`${id}-${itemLanguage}-instructions`}
            >
              <p className="text-sm text-muted-foreground">{t("editor_cast_instructions_hint")}</p>
              <PromptEditor
                id={`${id}-instructions-${itemLanguage}`}
                labelledBy={`${languageLabelId} ${id}-${itemLanguage}-instructions`}
                language={itemLanguage}
                value={value.instructions[itemLanguage]}
                disabled={disabled}
                onChange={(instructions) =>
                  onChange({
                    ...value,
                    instructions: { ...value.instructions, [itemLanguage]: instructions },
                  })
                }
              />
            </ConfigurationSection>
            <ConfigurationSection title={t("editor_cast_voice_group")} icon={AudioLines}>
              <StandardVoiceSelect
                storeId={storeId}
                inputId={`${id}-voice-${itemLanguage}`}
                language={itemLanguage}
                labelledBy={languageLabelId}
                value={value.voice[itemLanguage]}
                retained={voices.map((voice) => voice[itemLanguage])}
                disabled={disabled}
                onChange={(voiceId) =>
                  onChange({ ...value, voice: { ...value.voice, [itemLanguage]: voiceId } })
                }
              />
            </ConfigurationSection>
          </>
        )}
      </LanguageFields>
      <section className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card p-4 sm:p-5">
        <MessageSquare className="mt-3 size-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <BooleanField
            inputId={`${id}-proactive`}
            label={t("editor_proactive")}
            value={value.proactive}
            disabled={disabled}
            onChange={(proactive) => onChange({ ...value, proactive })}
          />
          <p className="text-sm text-muted-foreground">{t("editor_cast_proactive_hint")}</p>
        </div>
      </section>
    </div>
  );
}
