import { type Modifier, type Product } from "@tablecast/api/schema";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { Button } from "../../components/ui/button";
import * as Disclosure from "../../components/ui/disclosure";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { m } from "../../paraglide/messages";
import { emptyText } from "../configuration/configuration-defaults";
import { BilingualFields, NumericField } from "../configuration/configuration-fields";
import { type ImageStagedChange } from "../configuration/configuration-image-model";
import { configurationImageUploadKey } from "../configuration/menu-query";
import { ModifierOptionEditor } from "./modifier-option-editor";
import { encodeEditorId, newOption } from "./modifier-option-model";

export function ModifiersEditor({
  storeId,
  product,
  onChange,
  onImageStagedChange,
  disabled,
}: {
  disabled: boolean;
  onChange: React.Dispatch<React.SetStateAction<Modifier[]>>;
  onImageStagedChange?: ImageStagedChange;
  product: Product;
  storeId: string;
}) {
  const { t, locale } = useI18n();
  const client = useQueryClient();
  const uploadingImages = useIsMutating({ mutationKey: configurationImageUploadKey(storeId) }) > 0;
  const id = useId();
  const root = useRef<HTMLFieldSetElement>(null);
  const pendingFocus = useRef<null | string>(null);
  useEffect(() => {
    if (!pendingFocus.current) return;
    root.current?.querySelector<HTMLElement>(`#${CSS.escape(pendingFocus.current)}`)?.focus();
    pendingFocus.current = null;
  });
  const rowTitle = (kind: string, index: number, name: string) =>
    m.editor_row_title(
      { kind, index: index + 1, name: name || t("editor_not_configured") },
      { locale },
    );
  function updateGroup(groupId: string, change: Partial<Modifier>) {
    onChange(
      product.modifiers.map((group) => (group.id === groupId ? { ...group, ...change } : group)),
    );
  }
  function updateOption(
    group: Modifier,
    optionId: string,
    change: Partial<Modifier["options"][number]>,
  ) {
    onChange((current) =>
      current.map((item) =>
        item.id === group.id
          ? {
              ...item,
              options: item.options.map((option) =>
                option.id === optionId ? { ...option, ...change } : option,
              ),
            }
          : item,
      ),
    );
  }
  return (
    <fieldset
      ref={root}
      className="grid min-w-0 gap-6"
      disabled={disabled}
      aria-label={t("editor_modifiers")}
    >
      {product.modifiers.map((group, groupIndex) => {
        const groupId = `${id}-${encodeEditorId(group.id)}`;
        return (
          <fieldset
            key={group.id}
            aria-labelledby={groupId}
            className="@container grid min-w-0 gap-5 rounded-xl border border-border p-4 @xl:p-5"
          >
            <legend className="max-w-full px-2">
              <h3
                id={groupId}
                tabIndex={-1}
                className="scroll-mt-6 wrap-anywhere text-base font-semibold outline-offset-4"
              >
                {rowTitle(t("editor_modifier"), groupIndex, group.text[locale].displayName)}
              </h3>
            </legend>
            <div className="grid min-w-0 gap-4 @xl:grid-cols-3">
              <label className="grid min-w-0 gap-2 text-sm">
                <span id={`${groupId}-kind`}>{t("editor_kind")}</span>
                <NativeSelect
                  aria-labelledby={`${groupId} ${groupId}-kind`}
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
                labelledBy={groupId}
                label={t("editor_min")}
                value={group.min}
                min={0}
                max={20}
                onChange={(min) => updateGroup(group.id, { min })}
                disabled={disabled}
              />
              <NumericField
                labelledBy={groupId}
                label={t("editor_max")}
                value={group.max}
                min={1}
                max={group.kind === "single" ? 1 : 20}
                onChange={(max) => updateGroup(group.id, { max })}
                disabled={disabled}
              />
            </div>
            <Disclosure.Root className="group min-w-0">
              <Disclosure.Trigger
                aria-labelledby={`${groupId} ${groupId}-translation`}
                className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium focus-visible:outline-3 focus-visible:outline-offset-2"
              >
                <span id={`${groupId}-translation`}>{t("editor_translation")}</span>
              </Disclosure.Trigger>
              <Disclosure.Panel>
                <div className="pt-4">
                  <BilingualFields
                    labelledBy={groupId}
                    value={group.text}
                    onChange={(text) => updateGroup(group.id, { text })}
                    disabled={disabled}
                  />
                </div>
              </Disclosure.Panel>
            </Disclosure.Root>
            <div className="grid min-w-0 gap-6">
              {group.options.map((option, optionIndex) => (
                <ModifierOptionEditor
                  onImageStagedChange={onImageStagedChange}
                  storeId={storeId}
                  key={option.id}
                  option={option}
                  title={rowTitle(t("editor_option"), optionIndex, option.text[locale].displayName)}
                  id={`${groupId}-${encodeEditorId(option.id)}`}
                  labelledBy={groupId}
                  product={product}
                  disabled={disabled}
                  removable={group.options.length > 1 && !uploadingImages}
                  onChange={(change) => updateOption(group, option.id, change)}
                  onRemove={() => {
                    if (client.isMutating({ mutationKey: configurationImageUploadKey(storeId) }))
                      return;
                    const next = group.options[optionIndex + 1] ?? group.options[optionIndex - 1];
                    pendingFocus.current = next
                      ? `${groupId}-${encodeEditorId(next.id)}`
                      : `${groupId}-add`;
                    updateGroup(group.id, {
                      options: group.options.filter((item) => item.id !== option.id),
                    });
                  }}
                />
              ))}
              <Button
                id={`${groupId}-add`}
                variant="outline"
                type="button"
                className="justify-self-start"
                aria-labelledby={`${groupId}-add-label ${groupId}`}
                disabled={disabled || group.options.length >= 30}
                onClick={() => {
                  const option = newOption();
                  pendingFocus.current = `${groupId}-${encodeEditorId(option.id)}`;
                  updateGroup(group.id, { options: [...group.options, option] });
                }}
              >
                <Plus aria-hidden="true" />
                <span id={`${groupId}-add-label`}>{t("editor_add_option")}</span>
              </Button>
            </div>
            <Button
              variant="outline"
              type="button"
              className="justify-self-start"
              aria-labelledby={`${groupId}-remove ${groupId}`}
              disabled={disabled || uploadingImages}
              onClick={() => {
                if (client.isMutating({ mutationKey: configurationImageUploadKey(storeId) }))
                  return;
                const next = product.modifiers[groupIndex + 1] ?? product.modifiers[groupIndex - 1];
                pendingFocus.current = next ? `${id}-${encodeEditorId(next.id)}` : `${id}-add`;
                onChange(product.modifiers.filter((item) => item.id !== group.id));
              }}
            >
              <Trash2 aria-hidden="true" />
              <span id={`${groupId}-remove`}>{t("editor_remove_modifier")}</span>
            </Button>
          </fieldset>
        );
      })}
      <Button
        id={`${id}-add`}
        variant="outline"
        type="button"
        className="justify-self-start"
        disabled={disabled || product.modifiers.length >= 12}
        onClick={() => {
          const groupId = crypto.randomUUID();
          pendingFocus.current = `${id}-${encodeEditorId(groupId)}`;
          onChange([
            ...product.modifiers,
            {
              id: groupId,
              text: emptyText(),
              kind: "single",
              min: 0,
              max: 1,
              options: [newOption()],
            },
          ]);
        }}
      >
        <Plus aria-hidden="true" />
        {t("editor_add_modifier")}
      </Button>
    </fieldset>
  );
}
