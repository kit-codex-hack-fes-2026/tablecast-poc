import { conditionLimits, type OptionCondition } from "@tablecast/api/schema";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { NodeProps } from "./option-condition-model";
import { Button } from "../../components/ui/button";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { conditionOptionChoices, emptyLeaf } from "./option-condition-model";
import { ConditionActions, ConditionErrorNotice, OptionPicker } from "./option-condition-picker";

export function ConditionNode({
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
  const nextFocus = useRef<"add" | "last" | "node" | null>(null);
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
  const { selected, missing, items } = conditionOptionChoices(
    node,
    choices,
    t("editor_missing_reference"),
  );
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
          <OptionPicker
            node={node}
            items={items}
            id={id}
            invalid={invalid}
            missing={missing}
            selected={selected}
            disabled={disabled}
            onChange={onChange}
          />
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
        <ConditionActions
          node={node}
          depth={depth}
          disabled={disabled}
          onChange={onChange}
          onFocus={(target) => {
            nextFocus.current = target;
          }}
        />
        <Button type="button" variant="ghost" onClick={onRemove} aria-label={t("condition_remove")}>
          <Trash2 className="size-4" />
        </Button>
      </div>
      <ConditionErrorNotice
        id={id}
        invalid={invalid}
        missing={missing}
        selectedInvalid={selected?.invalid}
      />
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
