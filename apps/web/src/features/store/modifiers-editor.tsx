import { type Modifier, type Product } from "@tablecast/api/schema";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Image, Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { Button } from "../../components/ui/button";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { m } from "../../paraglide/messages";
import { ConfigurationImageField, type ImageStagedChange } from "./configuration-image-field";
import { emptyText } from "./configuration-defaults";
import {
  BilingualFields,
  BooleanField,
  NumericField,
  ReferencesField,
} from "./configuration-fields";
import { configurationImageUploadKey } from "./menu-query";

function encodeEditorId(value: string) {
  return encodeURIComponent(JSON.stringify(value));
}

function newOption(): Modifier["options"][number] {
  return {
    id: crypto.randomUUID(),
    text: emptyText(),
    priceDelta: 0,
    available: false,
    imageKey: null,
    imageKind: "illustration",
    maxQuantity: 1,
    requires: [],
    excludes: [],
  };
}

export function ModifiersEditor({
  storeId,
  product,
  onChange,
  onImageStagedChange,
  disabled,
}: {
  storeId: string;
  product: Product;
  onChange: (modifiers: Modifier[]) => void;
  onImageStagedChange?: ImageStagedChange;
  disabled: boolean;
}) {
  const { t, locale } = useI18n();
  const client = useQueryClient();
  const uploadingImages = useIsMutating({ mutationKey: configurationImageUploadKey(storeId) }) > 0;
  const id = useId();
  const root = useRef<HTMLFieldSetElement>(null);
  const pendingFocus = useRef<string | null>(null);
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
  const optionChoices = product.modifiers.flatMap((group, groupIndex) =>
    group.options.map((option, optionIndex) => ({
      id: option.id,
      label: m.editor_option_reference(
        {
          group: rowTitle(t("editor_modifier"), groupIndex, group.text[locale].displayName),
          option: rowTitle(t("editor_option"), optionIndex, option.text[locale].displayName),
        },
        { locale },
      ),
    })),
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
    updateGroup(group.id, {
      options: group.options.map((option) =>
        option.id === optionId ? { ...option, ...change } : option,
      ),
    });
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
            <details
              className="group min-w-0"
              onInvalidCapture={(event) => {
                event.currentTarget.open = true;
              }}
            >
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium focus-visible:outline-3 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 group-open:rotate-90" />
                {t("editor_translation")}
              </summary>
              <div className="pt-4">
                <BilingualFields
                  labelledBy={groupId}
                  value={group.text}
                  onChange={(text) => updateGroup(group.id, { text })}
                  disabled={disabled}
                />
              </div>
            </details>
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
                  references={optionChoices.filter((choice) => choice.id !== option.id)}
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

function ModifierOptionEditor({
  storeId,
  option,
  title,
  id: optionId,
  labelledBy,
  references,
  disabled,
  removable,
  onChange,
  onRemove,
  onImageStagedChange,
}: {
  storeId: string;
  option: Modifier["options"][number];
  title: string;
  id: string;
  labelledBy: string;
  references: { id: string; label: string }[];
  disabled: boolean;
  removable: boolean;
  onChange: (change: Partial<Modifier["options"][number]>) => void;
  onRemove: () => void;
  onImageStagedChange?: ImageStagedChange;
}) {
  const { t } = useI18n();
  const context = `${labelledBy} ${optionId}`;
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
      <details
        className="group min-w-0"
        onInvalidCapture={(event) => {
          event.currentTarget.open = true;
        }}
      >
        <summary
          aria-labelledby={`${context} ${optionId}-details`}
          className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium focus-visible:outline-3 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden"
        >
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 group-open:rotate-90" />
          <span id={`${optionId}-details`}>{t("editor_option_details")}</span>
        </summary>
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
          <div className="grid min-w-0 gap-4 @xl:grid-cols-2">
            <ReferencesField
              labelledBy={context}
              label={t("editor_requires")}
              value={option.requires}
              options={references}
              onChange={(requires) => onChange({ requires })}
              disabled={disabled}
            />
            <ReferencesField
              labelledBy={context}
              label={t("editor_excludes")}
              value={option.excludes}
              options={references}
              onChange={(excludes) => onChange({ excludes })}
              disabled={disabled}
            />
          </div>
        </div>
      </details>
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
