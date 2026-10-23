import { type Modifier, type Product } from "@tablecast/api/schema";
import { Image, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import * as Disclosure from "../../components/ui/disclosure";
import { useI18n } from "../../i18n/locale";
import { BilingualFields, BooleanField, NumericField } from "../configuration/configuration-fields";
import { ConfigurationImageField } from "../configuration/configuration-image-field";
import { type ImageStagedChange } from "../configuration/configuration-image-model";
import { OptionConditionsEditor } from "./option-conditions-editor";

export function ModifierOptionEditor({
  storeId,
  option,
  title,
  id: optionId,
  labelledBy,
  product,
  disabled,
  removable,
  onChange,
  onRemove,
  onImageStagedChange,
}: {
  disabled: boolean;
  id: string;
  labelledBy: string;
  onChange: (change: Partial<Modifier["options"][number]>) => void;
  onImageStagedChange?: ImageStagedChange;
  onRemove: () => void;
  option: Modifier["options"][number];
  product: Product;
  removable: boolean;
  storeId: string;
  title: string;
}) {
  const { t } = useI18n();
  const context = `${labelledBy} ${optionId}`;
  const [conditionsVisible, setConditionsVisible] = useState(false);
  return (
    <fieldset aria-labelledby={context} className="grid min-w-0 gap-4 border-t border-border pt-4">
      <legend className="max-w-full pt-4">
        <h4
          id={optionId}
          tabIndex={-1}
          className="scroll-mt-6 wrap-anywhere text-sm font-semibold outline-offset-4"
        >
          {title}
        </h4>
      </legend>
      <div className="grid min-w-0 items-end gap-4 @xl:grid-cols-3">
        <NumericField
          labelledBy={context}
          label={t("editor_price_delta")}
          value={option.priceDelta}
          min={-100_000}
          max={100_000}
          onChange={(priceDelta) => onChange({ priceDelta })}
          disabled={disabled}
        />
        <NumericField
          labelledBy={context}
          label={t("editor_max_quantity")}
          value={option.maxQuantity}
          min={1}
          max={20}
          onChange={(maxQuantity) => onChange({ maxQuantity })}
          disabled={disabled}
        />
        <BooleanField
          labelledBy={context}
          label={t("editor_available")}
          value={option.available}
          onChange={(available) => onChange({ available })}
          disabled={disabled}
        />
      </div>
      <Disclosure.Root
        onOpenChange={(open) => {
          if (open) setConditionsVisible(true);
        }}
        className="group min-w-0"
      >
        <Disclosure.Trigger
          aria-labelledby={`${context} ${optionId}-details`}
          className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium focus-visible:outline-3 focus-visible:outline-offset-2"
        >
          <span id={`${optionId}-details`}>{t("editor_option_details")}</span>
        </Disclosure.Trigger>
        <Disclosure.Panel>
          <div className="grid min-w-0 gap-5 pt-4">
            <BilingualFields
              labelledBy={context}
              value={option.text}
              onChange={(text) => onChange({ text })}
              disabled={disabled}
            />
            <fieldset
              className="grid min-w-0 gap-4"
              aria-labelledby={`${context} ${optionId}-images`}
            >
              <legend id={`${optionId}-images`} className="mb-3 text-sm font-semibold">
                <span className="flex items-center gap-2">
                  <Image aria-hidden="true" className="size-4" />
                  {t("editor_images")}
                </span>
              </legend>
              <ConfigurationImageField
                onStagedChange={onImageStagedChange}
                key={`${storeId}:${option.id}`}
                storeId={storeId}
                value={option}
                disabled={disabled}
                onChange={({ imageKey, imageKind }) => onChange({ imageKey, imageKind })}
              />
            </fieldset>
            {conditionsVisible && (
              <OptionConditionsEditor
                storeId={storeId}
                product={product}
                optionId={option.id}
                disabled={disabled}
                onChange={onChange}
              />
            )}
          </div>
        </Disclosure.Panel>
      </Disclosure.Root>
      <Button
        variant="outline"
        type="button"
        className="justify-self-start"
        aria-labelledby={`${optionId}-remove ${context}`}
        disabled={disabled || !removable}
        onClick={onRemove}
      >
        <Trash2 aria-hidden="true" />
        <span id={`${optionId}-remove`}>{t("editor_remove_option")}</span>
      </Button>
    </fieldset>
  );
}
