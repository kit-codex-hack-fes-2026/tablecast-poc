import { Combobox } from "@base-ui/react/combobox";
import {
  conditionLimits,
  optionConditionSchema,
  type OptionCondition,
  type OptionConditions,
  type Product,
} from "@tablecast/api/schema";
import { useMutation } from "@tanstack/react-query";
import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { ConditionSummary } from "../../components/condition-summary";
import { ErrorNotice } from "../../components/error-notice";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";

function legacyExpression(ids: string[], kind: "and" | "or"): OptionCondition | null {
  if (!ids.length) return null;
  if (ids.length === 1) return { kind: "option", optionId: ids[0] ?? "" };
  if (ids.length <= conditionLimits.children)
    return { kind, children: ids.map((optionId) => ({ kind: "option", optionId })) };
  const children: OptionCondition[] = [];
  for (let index = 0; index < ids.length; index += conditionLimits.children) {
    const child = legacyExpression(ids.slice(index, index + conditionLimits.children), kind);
    if (child) children.push(child);
  }
  // 旧配列を切り捨てず表示する。新上限を超える場合は構造エラーとして編集を求める。
  return { kind, children };
}

const emptyLeaf = (): OptionCondition => ({ kind: "option", optionId: "" });
type Choice = {
  id: string;
  label: string;
  search: string;
  available: boolean;
  invalid: boolean;
  missing?: boolean;
};
type NodeProps = {
  node: OptionCondition;
  choices: Choice[];
  depth: number;
  path: string;
  invalidPaths: string[];
  onChange: (node: OptionCondition) => void;
  onRemove: () => void;
  disabled: boolean;
};

function ConditionNode({
  node,
  choices,
  depth,
  path,
  invalidPaths,
  onChange,
  onRemove,
  disabled,
}: NodeProps) {
  const { t } = useI18n();
  const id = useId();
  const root = useRef<HTMLFieldSetElement>(null);
  const nextFocus = useRef<"add" | "node" | "last" | null>(null);
  const [keys] = useState(() => new WeakMap<OptionCondition, string>());
  function key(child: OptionCondition) {
    let value = keys.get(child);
    if (!value) {
      value = crypto.randomUUID();
      keys.set(child, value);
    }
    return value;
  }
  const invalid = invalidPaths.includes(path);
  useEffect(() => {
    if (nextFocus.current) {
      const controls = root.current?.querySelectorAll<HTMLElement>("[data-node-control]");
      const target =
        nextFocus.current === "last"
          ? controls?.[controls.length - 1]
          : nextFocus.current === "add"
            ? root.current?.querySelector<HTMLElement>("[data-add]")
            : controls?.[0];
      target?.focus();
      nextFocus.current = null;
    }
  });
  const selected =
    node.kind === "option" ? choices.find((choice) => choice.id === node.optionId) : undefined;
  const missing = node.kind === "option" && !!node.optionId && !selected;
  const items =
    missing && node.kind === "option"
      ? [
          ...choices,
          {
            id: node.optionId,
            label: `${node.optionId} · ${t("editor_missing_reference")}`,
            search: node.optionId,
            available: false,
            invalid: true,
            missing: true,
          },
        ]
      : choices;
  return (
    <fieldset
      ref={root}
      className="grid min-w-0 gap-3 rounded-lg border border-border bg-background p-3"
      aria-labelledby={`${id}-legend`}
      disabled={disabled}
    >
      <legend id={`${id}-legend`} className="px-1 text-xs font-semibold">
        {node.kind === "option" ? t("condition_leaf") : node.kind.toUpperCase()}
      </legend>
      <div className="flex min-w-0 flex-wrap items-start gap-2">
        {node.kind === "option" ? (
          <Combobox.Root
            items={items}
            value={
              items.find((item) => item.id === (node.kind === "option" ? node.optionId : "")) ??
              null
            }
            itemToStringLabel={(item) => item.label}
            isItemEqualToValue={(a, b) => a.id === b.id}
            filter={(item, query) =>
              item.search.toLocaleLowerCase().includes(query.toLocaleLowerCase())
            }
            disabled={disabled}
            onValueChange={(item) => onChange({ kind: "option", optionId: item?.id ?? "" })}
          >
            <div className="relative min-w-0 flex-1 basis-48">
              <Combobox.Input
                data-node-control
                aria-label={t("condition_choose")}
                aria-invalid={invalid || missing || selected?.invalid || undefined}
                aria-describedby={invalid || missing ? `${id}-error` : undefined}
                placeholder={t("condition_search")}
                className="h-11 w-full min-w-0 rounded-md border border-input bg-background pl-3 pr-10 text-base"
              />
              <Combobox.Trigger
                aria-label={t("condition_candidates")}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center"
              >
                <ChevronDown className="size-4" />
              </Combobox.Trigger>
            </div>
            <Combobox.Portal>
              <Combobox.Positioner sideOffset={4} className="z-50 max-w-[calc(100vw-24px)]">
                <Combobox.Popup className="max-h-72 w-(--anchor-width) overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg">
                  <Combobox.Empty className="p-3 text-sm">
                    {t("condition_no_candidates")}
                  </Combobox.Empty>
                  <Combobox.List>
                    {(item: Choice) => (
                      <Combobox.Item
                        key={item.id}
                        value={item}
                        disabled={item.invalid}
                        className="flex min-h-11 cursor-default items-center gap-2 rounded-md p-2 text-sm wrap-anywhere data-highlighted:bg-accent data-disabled:opacity-50"
                      >
                        <Combobox.ItemIndicator>
                          <Check className="size-4" />
                        </Combobox.ItemIndicator>
                        <span>
                          {item.label}
                          <span className="block text-xs text-muted-foreground">
                            {item.id}
                            {item.missing
                              ? ` · ${t("editor_missing_reference")}`
                              : item.invalid
                                ? ` · ${t("condition_self")}`
                                : !item.available
                                  ? ` · ${t("condition_sold_out")}`
                                  : ""}
                          </span>
                        </span>
                      </Combobox.Item>
                    )}
                  </Combobox.List>
                </Combobox.Popup>
              </Combobox.Positioner>
            </Combobox.Portal>
          </Combobox.Root>
        ) : node.kind !== "not" ? (
          <NativeSelect
            data-node-control
            aria-label={t("condition_operator")}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `${id}-error` : undefined}
            value={node.kind}
            className="min-h-11 w-auto"
            onChange={(event) => {
              if (event.target.value === "and" || event.target.value === "or")
                onChange({ ...node, kind: event.target.value });
            }}
          >
            <option value="and">{t("condition_all")}</option>
            <option value="or">{t("condition_any")}</option>
          </NativeSelect>
        ) : (
          <span className="py-3 text-sm">{t("condition_not_scope")}</span>
        )}
        {node.kind !== "not" && (
          <Button
            type="button"
            variant="outline"
            disabled={disabled || depth >= conditionLimits.depth}
            onClick={() => {
              nextFocus.current = "node";
              onChange({ kind: "not", child: node });
            }}
          >
            {t("condition_negate")}
          </Button>
        )}
        {node.kind === "not" && (
          <Button
            data-node-control
            type="button"
            variant="outline"
            onClick={() => {
              nextFocus.current = "node";
              onChange(node.child);
            }}
          >
            {t("condition_unwrap")}
          </Button>
        )}
        {node.kind === "option" && (
          <Button
            type="button"
            variant="outline"
            disabled={disabled || depth >= conditionLimits.depth}
            onClick={() => {
              nextFocus.current = "last";
              onChange({ kind: "and", children: [node, emptyLeaf()] });
            }}
          >
            {t("condition_group")}
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onRemove} aria-label={t("condition_remove")}>
          <Trash2 className="size-4" />
        </Button>
      </div>
      {(invalid || missing || selected?.invalid) && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {missing ? t("editor_missing_reference") : t("condition_invalid")}
        </p>
      )}
      {node.kind === "not" && (
        <ConditionNode
          node={node.child}
          choices={choices}
          depth={depth + 1}
          path={`${path}.child`}
          invalidPaths={invalidPaths}
          disabled={disabled}
          onChange={(child) => onChange({ kind: "not", child })}
          onRemove={() => {
            nextFocus.current = "node";
            onChange({ kind: "not", child: emptyLeaf() });
          }}
        />
      )}
      {(node.kind === "and" || node.kind === "or") && (
        <>
          <div className="grid min-w-0 gap-2 border-l-2 border-primary/20 pl-2">
            {node.children.map((child, index) => (
              <ConditionNode
                key={key(child)}
                node={child}
                choices={choices}
                depth={depth + 1}
                path={`${path}.children.${index}`}
                invalidPaths={invalidPaths}
                disabled={disabled}
                onChange={(next) => {
                  keys.set(next, key(child));
                  onChange({
                    ...node,
                    children: node.children.map((item, childIndex) =>
                      childIndex === index ? next : item,
                    ),
                  });
                }}
                onRemove={() => {
                  nextFocus.current = "add";
                  onChange({
                    ...node,
                    children: node.children.filter((_item, childIndex) => childIndex !== index),
                  });
                }}
              />
            ))}
          </div>
          <Button
            data-add
            type="button"
            variant="outline"
            className="justify-self-start"
            disabled={
              disabled ||
              node.children.length >= conditionLimits.children ||
              depth >= conditionLimits.depth
            }
            onClick={() => {
              nextFocus.current = "last";
              onChange({ ...node, children: [...node.children, emptyLeaf()] });
            }}
          >
            <Plus className="size-4" />
            {t("condition_add_leaf")}
          </Button>
        </>
      )}
    </fieldset>
  );
}

export function OptionConditionsEditor({
  storeId,
  product,
  optionId,
  disabled,
  onChange,
}: {
  storeId: string;
  product: Product;
  optionId: string;
  disabled: boolean;
  onChange: (change: Partial<Product["modifiers"][number]["options"][number]>) => void;
}) {
  const { locale, t } = useI18n();
  const id = useId();
  const option = product.modifiers
    .flatMap((group) => group.options)
    .find((item) => item.id === optionId);
  const [selections, setSelections] = useState<string[]>([optionId]);
  const root = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<"requires" | "excludes" | null>(null);
  const signature = JSON.stringify([product, selections]);
  const selectedIds = new Set(selections);
  const preview = useMutation({
    mutationFn: async (request: { signature: string; product: Product; selections: string[] }) => ({
      signature: request.signature,
      result: await parseResponse(
        rpc.api.admin.stores[":storeId"].conditions.preview.$post({
          param: { storeId },
          json: {
            product: request.product,
            optionId,
            selections: request.selections.map((selectedId) => ({
              optionId: selectedId,
              quantity: 1,
            })),
          },
        }),
      ),
    }),
  });
  useEffect(() => {
    if (pendingFocus.current) {
      root.current
        ?.querySelector<HTMLElement>(
          `[data-relation="${pendingFocus.current}"] [data-node-control]`,
        )
        ?.focus();
      pendingFocus.current = null;
    }
  });
  if (!option) return null;
  const value: OptionConditions = option.conditions ?? {
    version: 2,
    requires: legacyExpression(option.requires, "and"),
    excludes: legacyExpression(option.excludes, "or"),
  };
  const choices: Choice[] = product.modifiers.flatMap((group) =>
    group.options.map((item) => ({
      id: item.id,
      label: `${group.text[locale].displayName} / ${item.text[locale].displayName}`,
      search: `${item.id} ${group.text.ja.displayName} ${group.text.en.displayName} ${item.text.ja.displayName} ${item.text.en.displayName}`,
      available: item.available,
      invalid: item.id === optionId,
    })),
  );
  const update = (relation: "requires" | "excludes", expression: OptionCondition | null) =>
    onChange({ requires: [], excludes: [], conditions: { ...value, [relation]: expression } });
  const valid = (["requires", "excludes"] as const).every(
    (relation) =>
      value[relation] === null || optionConditionSchema.safeParse(value[relation]).success,
  );
  const result = preview.data?.signature === signature ? preview.data.result : undefined;
  return (
    <div ref={root} className="grid min-w-0 gap-5" aria-label={t("condition_editor")}>
      <div className="space-y-1">
        <h5 className="font-semibold">{t("condition_editor")}</h5>
        <p className="text-sm text-muted-foreground">{t("condition_help")}</p>
      </div>
      {(["requires", "excludes"] as const).map((relation) => {
        const expression = value[relation];
        const parsed = expression ? optionConditionSchema.safeParse(expression) : null;
        const invalidPaths =
          parsed && !parsed.success
            ? parsed.error.issues.map((issue) =>
                [relation, ...issue.path.filter((part) => part !== "optionId")]
                  .join(".")
                  .replace(/\.children$/, ""),
              )
            : [];
        return (
          <section
            key={relation}
            data-relation={relation}
            aria-labelledby={`${id}-${relation}`}
            className="grid min-w-0 gap-3"
          >
            <h6 id={`${id}-${relation}`} className="text-sm font-semibold">
              {t(relation === "requires" ? "condition_requires" : "condition_excludes")}
            </h6>
            {expression ? (
              <>
                <ConditionNode
                  node={expression}
                  choices={choices}
                  depth={1}
                  path={relation}
                  invalidPaths={invalidPaths}
                  disabled={disabled}
                  onChange={(next) => update(relation, next)}
                  onRemove={() => update(relation, null)}
                />
                <p className="rounded-md bg-muted p-3 text-sm">
                  <ConditionSummary expression={expression} product={product} />
                </p>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="justify-self-start"
                disabled={disabled}
                onClick={() => {
                  pendingFocus.current = relation;
                  update(relation, emptyLeaf());
                }}
              >
                <Plus className="size-4" />
                {t("condition_add")}
              </Button>
            )}
          </section>
        );
      })}
      <details className="rounded-lg border border-border p-3">
        <summary className="min-h-11 cursor-pointer text-sm font-medium">
          {t("condition_try")}
        </summary>
        <p className="mb-3 text-sm text-muted-foreground">{t("condition_try_help")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {choices.map((choice) => (
            <label key={choice.id} className="flex min-h-11 items-center gap-2 text-sm">
              <Checkbox
                checked={selectedIds.has(choice.id)}
                onCheckedChange={(checked) =>
                  setSelections((current) =>
                    checked
                      ? [...current, choice.id]
                      : current.filter((item) => item !== choice.id),
                  )
                }
              />
              {choice.label} <span className="text-xs text-muted-foreground">{choice.id}</span>
            </label>
          ))}
        </div>
        <Button
          type="button"
          className="mt-3"
          disabled={disabled || !valid || preview.isPending}
          onClick={() => preview.mutate({ signature, product, selections })}
        >
          {t("condition_run")}
        </Button>
        <ErrorNotice error={preview.error} />
        {result && (
          <div role="status" className="mt-3 space-y-2 text-sm">
            {!result.applied && <p>{t("condition_not_applied")}</p>}
            {result.conditions.map((condition) => (
              <div key={condition.relation}>
                <p>
                  {t(
                    condition.relation === "requires" ? "condition_requires" : "condition_excludes",
                  )}
                  ：{t(condition.satisfied ? "condition_satisfied" : "condition_unsatisfied")}
                </p>
                {condition.nodes.length > 1 && (
                  <ul className="ml-4 list-disc">
                    {condition.nodes.map((node) => (
                      <li key={node.path.join(".")}>
                        {node.path.join(" / ") || t("condition_root")}：
                        {t(node.matched ? "condition_true" : "condition_false")}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {result.errors.length > 0 && (
              <p className="text-destructive">{t("condition_invalid")}</p>
            )}
            {result.selectionError && (
              <p>
                {t("condition_selection_error")} · {result.selectionError}
              </p>
            )}
          </div>
        )}
      </details>
    </div>
  );
}
