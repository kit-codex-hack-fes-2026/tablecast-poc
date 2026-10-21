import { type Product, productSchema } from "@tablecast/api/schema";
import { Image, Info, Languages, ShieldCheck, SlidersHorizontal } from "lucide-react";
import type { EditorProps } from "../configuration/configuration-editor-model";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { selectClass } from "../configuration/configuration-editor-model";
import {
  BilingualFields,
  BooleanField,
  ConfigurationSection,
  NumericField,
  StringListField,
} from "../configuration/configuration-fields";
import { ConfigurationImageField } from "../configuration/configuration-image-field";
import { type ImageStagedChange } from "../configuration/configuration-image-model";
import { LanguageFields } from "../configuration/language-fields";
import { ModifiersEditor } from "./modifiers-editor";

export function ProductsEditor({
  storeId,
  value,
  onChange,
  disabled,
  selectedId,
  onImageStagedChange,
}: EditorProps & { onImageStagedChange?: ImageStagedChange; storeId: string }) {
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
