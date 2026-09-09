import type { Modifier, Product } from "@tablecast/api/schema";
import { Button } from "../../components/ui/button";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { emptyText } from "./configuration-defaults";

import {
  BilingualFields,
  BooleanField,
  NumericField,
  ReferencesField,
} from "./configuration-fields";

function newOption(): Modifier["options"][number] {
  return {
    id: crypto.randomUUID(),
    text: emptyText(),
    priceDelta: 0,
    available: false,
    maxQuantity: 1,
    requires: [],
    excludes: [],
  };
}

export function ModifiersEditor({
  product,
  onChange,
  disabled,
}: {
  product: Product;
  onChange: (modifiers: Modifier[]) => void;
  disabled: boolean;
}) {
  const { t, locale } = useI18n();
  const optionChoices = product.modifiers.flatMap((group, groupIndex) =>
    group.options.map((option, optionIndex) => ({
      id: option.id,
      label: `${group.text[locale].displayName || `${t("editor_modifier")} ${groupIndex + 1}`} · ${option.text[locale].displayName || `${t("editor_option")} ${optionIndex + 1}`}`,
    })),
  );
  function updateGroup(id: string, change: Partial<Modifier>) {
    onChange(product.modifiers.map((group) => (group.id === id ? { ...group, ...change } : group)));
  }
  function updateOption(group: Modifier, id: string, change: Partial<Modifier["options"][number]>) {
    updateGroup(group.id, {
      options: group.options.map((option) =>
        option.id === id ? { ...option, ...change } : option,
      ),
    });
  }
  return (
    <fieldset className="grid min-w-0 gap-5" disabled={disabled}>
      <legend className="mb-4 font-semibold">{t("editor_modifiers")}</legend>
      {product.modifiers.map((group, groupIndex) => (
        <fieldset key={group.id} className="grid min-w-0 gap-5 rounded-lg border border-border p-4">
          <legend className="px-2 font-semibold">
            {group.text[locale].displayName || `${t("editor_modifier")} ${groupIndex + 1}`}
          </legend>
          <BilingualFields
            value={group.text}
            onChange={(text) => updateGroup(group.id, { text })}
            disabled={disabled}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="grid gap-2">
              {t("editor_kind")}
              <NativeSelect
                className="h-12 rounded-lg border border-input px-3 text-base"
                value={group.kind}
                disabled={disabled}
                onChange={(event) => {
                  const kind = event.target.value;
                  if (kind === "single" || kind === "multiple" || kind === "quantity")
                    updateGroup(group.id, { kind });
                }}
              >
                <option value="single">{t("editor_single")}</option>
                <option value="multiple">{t("editor_multiple")}</option>
                <option value="quantity">{t("editor_quantity")}</option>
              </NativeSelect>
            </label>
            <NumericField
              label={t("editor_min")}
              value={group.min}
              min={0}
              max={20}
              onChange={(min) => updateGroup(group.id, { min })}
              disabled={disabled}
            />
            <NumericField
              label={t("editor_max")}
              value={group.max}
              min={1}
              max={group.kind === "single" ? 1 : 20}
              onChange={(max) => updateGroup(group.id, { max })}
              disabled={disabled}
            />
          </div>
          <fieldset className="grid min-w-0 gap-4">
            <legend className="mb-3 font-semibold">{t("editor_options")}</legend>
            {group.options.map((option, optionIndex) => {
              const references = optionChoices.filter((choice) => choice.id !== option.id);
              return (
                <fieldset
                  key={option.id}
                  className="grid min-w-0 gap-4 rounded-lg border border-border p-4"
                >
                  <legend className="px-2 font-semibold">
                    {option.text[locale].displayName || `${t("editor_option")} ${optionIndex + 1}`}
                  </legend>
                  <BilingualFields
                    value={option.text}
                    onChange={(text) => updateOption(group, option.id, { text })}
                    disabled={disabled}
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <NumericField
                      label={t("editor_price_delta")}
                      value={option.priceDelta}
                      min={-100_000}
                      max={100_000}
                      onChange={(priceDelta) => updateOption(group, option.id, { priceDelta })}
                      disabled={disabled}
                    />
                    <NumericField
                      label={t("editor_max_quantity")}
                      value={option.maxQuantity}
                      min={1}
                      max={20}
                      onChange={(maxQuantity) => updateOption(group, option.id, { maxQuantity })}
                      disabled={disabled}
                    />
                  </div>
                  <BooleanField
                    label={t("editor_available")}
                    value={option.available}
                    onChange={(available) => updateOption(group, option.id, { available })}
                    disabled={disabled}
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ReferencesField
                      label={t("editor_requires")}
                      value={option.requires}
                      options={references}
                      onChange={(requires) => updateOption(group, option.id, { requires })}
                      disabled={disabled}
                    />
                    <ReferencesField
                      label={t("editor_excludes")}
                      value={option.excludes}
                      options={references}
                      onChange={(excludes) => updateOption(group, option.id, { excludes })}
                      disabled={disabled}
                    />
                  </div>
                  <Button
                    variant="outline"
                    type="button"
                    className="justify-self-start"
                    disabled={disabled || group.options.length <= 1}
                    onClick={() =>
                      updateGroup(group.id, {
                        options: group.options.filter((item) => item.id !== option.id),
                      })
                    }
                  >
                    {t("editor_remove_option")}
                  </Button>
                </fieldset>
              );
            })}
            <Button
              variant="outline"
              type="button"
              className="justify-self-start"
              disabled={disabled || group.options.length >= 30}
              onClick={() => updateGroup(group.id, { options: [...group.options, newOption()] })}
            >
              {t("editor_add_option")}
            </Button>
          </fieldset>
          <Button
            variant="outline"
            type="button"
            className="justify-self-start"
            disabled={disabled}
            onClick={() => onChange(product.modifiers.filter((item) => item.id !== group.id))}
          >
            {t("editor_remove_modifier")}
          </Button>
        </fieldset>
      ))}
      <Button
        variant="outline"
        type="button"
        className="justify-self-start"
        disabled={disabled || product.modifiers.length >= 12}
        onClick={() =>
          onChange([
            ...product.modifiers,
            {
              id: crypto.randomUUID(),
              text: emptyText(),
              kind: "single",
              min: 0,
              max: 1,
              options: [newOption()],
            },
          ])
        }
      >
        {t("editor_add_modifier")}
      </Button>
    </fieldset>
  );
}
