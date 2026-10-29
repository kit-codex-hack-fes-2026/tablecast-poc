import { resolveText } from "@tablecast/api/localization";
import {
  type CartLine,
  type OptionCondition,
  type OptionConditions,
  optionConditionSchema,
  type Product,
} from "@tablecast/api/schema";
import { useMutation } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { Choice } from "./option-condition-model";
import { ConditionSummary } from "../../components/condition-summary";
import { ErrorNotice } from "../../components/error-notice";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import * as Disclosure from "../../components/ui/disclosure";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { emptyLeaf, legacyExpression } from "./option-condition-model";
import { ConditionNode } from "./option-condition-node";

export function OptionConditionsEditor({
  storeId,
  product,
  optionId,
  disabled,
  onChange,
}: {
  disabled: boolean;
  onChange: (change: Partial<Product["modifiers"][number]["options"][number]>) => void;
  optionId: string;
  product: Product;
  storeId: string;
}) {
  const { locale, t } = useI18n();
  const id = useId();
  const option = product.modifiers
    .flatMap((group) => group.options)
    .find((item) => item.id === optionId);
  const [selections, setSelections] = useState<CartLine["selections"]>([{ optionId, quantity: 1 }]);
  const optionIds = new Set(
    product.modifiers.flatMap((group) => group.options.map((item) => item.id)),
  );
  const presentSelections = selections.filter((selection) => optionIds.has(selection.optionId));
  if (presentSelections.length !== selections.length) setSelections(presentSelections);
  const root = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<"excludes" | "requires" | null>(null);
  const signature = JSON.stringify([product, selections]);
  const quantities = new Map(
    selections.map((selection) => [selection.optionId, selection.quantity]),
  );
  const preview = useMutation({
    mutationFn: async (request: {
      product: Product;
      selections: CartLine["selections"];
      signature: string;
    }) => ({
      signature: request.signature,
      result: await parseResponse(
        rpc.api.admin.stores[":storeId"].conditions.preview.$post({
          param: { storeId },
          json: {
            product: request.product,
            optionId,
            selections: request.selections,
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
      label: `${resolveText(group.text, locale).displayName} / ${resolveText(item.text, locale).displayName}`,
      search: `${item.id} ${group.text.ja.displayName} ${resolveText(group.text, "en").displayName} ${item.text.ja.displayName} ${resolveText(item.text, "en").displayName}`,
      available: item.available,
      invalid: item.id === optionId,
      allowsQuantity: group.kind === "quantity",
    })),
  );
  const update = (relation: "excludes" | "requires", expression: null | OptionCondition) =>
    onChange({ requires: [], excludes: [], conditions: { ...value, [relation]: expression } });
  const valid = (["requires", "excludes"] as const).every(
    (relation) =>
      value[relation] === null || optionConditionSchema.safeParse(value[relation]).success,
  );
  const result = preview.data?.signature === signature ? preview.data.result : undefined;
  return (
    <div
      ref={root}
      data-condition-editor
      className="grid min-w-0 gap-5"
      aria-label={t("condition_editor")}
    >
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
      <Disclosure.Root className="rounded-lg border border-border p-3">
        <Disclosure.Trigger className="min-h-11 cursor-pointer text-sm font-medium">
          {t("condition_try")}
        </Disclosure.Trigger>
        <Disclosure.Panel>
          <p className="mb-3 text-sm text-muted-foreground">{t("condition_try_help")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {choices.map((choice) => (
              <div key={choice.id} className="flex min-w-0 flex-wrap items-center gap-2">
                <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-sm">
                  <Checkbox
                    disabled={disabled}
                    checked={quantities.has(choice.id)}
                    onCheckedChange={(checked) =>
                      setSelections((current) =>
                        checked
                          ? [...current, { optionId: choice.id, quantity: 1 }]
                          : current.filter((item) => item.optionId !== choice.id),
                      )
                    }
                  />
                  <span className="wrap-anywhere">{choice.label}</span>
                </label>
                {choice.allowsQuantity && quantities.has(choice.id) && (
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    {t("common_quantity")}
                    <NativeSelect
                      aria-label={`${choice.label} (${choice.id}) · ${t("common_quantity")}`}
                      className="min-h-11 w-20"
                      value={quantities.get(choice.id)}
                      disabled={disabled}
                      onChange={(event) => {
                        const quantity = Number(event.target.value);
                        setSelections((current) =>
                          current.map((item) =>
                            item.optionId === choice.id ? { ...item, quantity } : item,
                          ),
                        );
                      }}
                    >
                      {Array.from({ length: 20 }, (_value, index) => (
                        <option key={index + 1} value={index + 1}>
                          {index + 1}
                        </option>
                      ))}
                    </NativeSelect>
                  </label>
                )}
              </div>
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
          <ErrorNotice error={preview.variables?.signature === signature ? preview.error : null} />
          {result && (
            <div role="status" className="mt-3 space-y-2 text-sm">
              {!result.applied && <p>{t("condition_not_applied")}</p>}
              {result.conditions.map((condition) => (
                <div key={condition.relation}>
                  <p>
                    {t(
                      condition.relation === "requires"
                        ? "condition_requires"
                        : "condition_excludes",
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
        </Disclosure.Panel>
      </Disclosure.Root>
    </div>
  );
}
