import { type Product, unknownFoodProfile } from "@tablecast/api/schema";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Input } from "../../components/ui/input";
import * as Tabs from "../../components/ui/tabs";
import { useI18n } from "../../i18n/locale";
import { BooleanField } from "../configuration/configuration-fields";
import { LanguageFields } from "../configuration/language-fields";
import { FoodPreview } from "./food-preview";
import { FoodProfileEditor } from "./food-profile-editor";

export function FoodInformationEditor({
  product,
  storeId,
  disabled,
  onChange,
}: {
  disabled: boolean;
  onChange: (change: Partial<Product>) => void;
  product: Product;
  storeId: string;
}) {
  const { t, locale } = useI18n();
  const value = product.foodInfo;
  const [selected, setSelected] = useState("base");
  const active =
    selected === "preview" ||
    value.components.some((component) => `component:${component.id}` === selected)
      ? selected
      : "base";
  const defaults = new Set(value.defaultComponentIds);
  return (
    <div className="grid gap-5">
      <Tabs.Root
        value={active}
        onValueChange={(next) => {
          if (typeof next === "string") setSelected(next);
        }}
        className="grid gap-3"
      >
        <Tabs.List className="gap-1 p-1">
          <Tabs.Tab value="base">{t("food_base")}</Tabs.Tab>
          {value.components.map((component) => (
            <Tabs.Tab key={component.id} value={`component:${component.id}`}>
              {component.name[locale]}
            </Tabs.Tab>
          ))}
          <Tabs.Tab value="preview">{t("food_preview")}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="base">
          <FoodProfileEditor
            value={value.base}
            disabled={disabled}
            onChange={(base) => onChange({ foodInfo: { ...value, base } })}
          />
        </Tabs.Panel>
        {value.components.map((component) => (
          <Tabs.Panel key={component.id} value={`component:${component.id}`} className="grid gap-3">
            <div className="grid gap-4 pt-3">
              <LanguageFields>
                {(language) => (
                  <label className="grid gap-2 text-sm">
                    {t("food_component_name")}
                    <Input
                      lang={language}
                      disabled={disabled}
                      value={component.name[language]}
                      onChange={(event) =>
                        onChange({
                          foodInfo: {
                            ...value,
                            components: value.components.map((item) =>
                              item.id === component.id
                                ? {
                                    ...item,
                                    name: { ...item.name, [language]: event.target.value },
                                  }
                                : item,
                            ),
                          },
                        })
                      }
                    />
                  </label>
                )}
              </LanguageFields>
              <BooleanField
                label={t("food_default_component")}
                disabled={disabled}
                value={defaults.has(component.id)}
                onChange={(included) =>
                  onChange({
                    foodInfo: {
                      ...value,
                      defaultComponentIds: included
                        ? [...value.defaultComponentIds, component.id]
                        : value.defaultComponentIds.filter((id) => id !== component.id),
                    },
                  })
                }
              />
              <FoodProfileEditor
                value={component.profile}
                disabled={disabled}
                onChange={(profile) =>
                  onChange({
                    foodInfo: {
                      ...value,
                      components: value.components.map((item) =>
                        item.id === component.id ? { ...item, profile } : item,
                      ),
                    },
                  })
                }
              />
              <Button
                type="button"
                variant="destructive"
                disabled={
                  disabled ||
                  defaults.has(component.id) ||
                  product.modifiers.some((group) =>
                    group.options.some(
                      (option) =>
                        option.foodChanges?.add.includes(component.id) ||
                        option.foodChanges?.remove.includes(component.id),
                    ),
                  )
                }
                onClick={() =>
                  onChange({
                    foodInfo: {
                      ...value,
                      components: value.components.filter((item) => item.id !== component.id),
                    },
                  })
                }
              >
                {t("common_remove")}
              </Button>
              <p className="text-sm text-muted-foreground">{t("food_remove_help")}</p>
            </div>
          </Tabs.Panel>
        ))}
        <Tabs.Panel value="preview">
          <FoodPreview key={`${storeId}:${product.id}`} product={product} storeId={storeId} />
        </Tabs.Panel>
      </Tabs.Root>
      <Button
        type="button"
        variant="outline"
        disabled={disabled || value.components.length >= 60}
        onClick={() => {
          const id = `tablecast-food-${crypto.randomUUID()}`;
          onChange({
            foodInfo: {
              ...value,
              components: [
                ...value.components,
                {
                  id,
                  name: { ja: "新しい具材", en: "New component" },
                  profile: unknownFoodProfile(),
                },
              ],
            },
          });
          setSelected(`component:${id}`);
        }}
      >
        {t("food_add_component")}
      </Button>
    </div>
  );
}

export function FoodChangesEditor({
  product,
  option,
  disabled,
  onChange,
}: {
  disabled: boolean;
  onChange: (change: Partial<typeof option>) => void;
  option: Product["modifiers"][number]["options"][number];
  product: Product;
}) {
  const { t, locale } = useI18n();
  const changes = option.foodChanges ?? { add: [], remove: [] };
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-3 font-medium">{t("food_changes")}</legend>
      {!product.foodInfo.components.length && (
        <p className="text-sm text-muted-foreground">{t("food_components_first")}</p>
      )}
      {(["add", "remove"] as const).map((key) => (
        <div key={key}>
          <p className="text-sm font-medium">{t(key === "add" ? "food_add" : "food_remove")}</p>
          {[
            ...new Set([
              ...product.foodInfo.components.map((component) => component.id),
              ...changes[key],
            ]),
          ].map((id) => (
            <label key={id} className="flex min-h-11 items-center gap-3 text-sm">
              <Checkbox
                disabled={disabled}
                checked={changes[key].includes(id)}
                onCheckedChange={(checked) =>
                  onChange({
                    foodChanges: {
                      ...changes,
                      [key]: checked
                        ? [...changes[key], id]
                        : changes[key].filter((value) => value !== id),
                    },
                  })
                }
              />
              {product.foodInfo.components.find((component) => component.id === id)?.name[locale] ??
                `${t("editor_missing_reference")}: ${id}`}
            </label>
          ))}
        </div>
      ))}
    </fieldset>
  );
}
