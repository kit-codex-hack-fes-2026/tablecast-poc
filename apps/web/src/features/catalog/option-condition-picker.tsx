import { Combobox } from "@base-ui/react/combobox";
import { conditionLimits, type OptionCondition } from "@tablecast/api/schema";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "tailwind-variants";
import type { Choice, NodeProps } from "./option-condition-model";
import { Button } from "../../components/ui/button";
import { controlMotion, surfaceMotion } from "../../components/ui/motion-variants";
import { useI18n } from "../../i18n/locale";
import { emptyLeaf } from "./option-condition-model";

export function OptionPicker({
  node,
  items,
  id,
  invalid,
  missing,
  selected,
  disabled,
  onChange,
}: {
  disabled: boolean;
  id: string;
  invalid: boolean;
  items: Choice[];
  missing: boolean;
  node: Extract<OptionCondition, { kind: "option" }>;
  onChange: NodeProps["onChange"];
  selected?: Choice;
}) {
  const { t } = useI18n();
  return (
    <Combobox.Root
      items={items}
      value={
        items.find((item) => item.id === (node.kind === "option" ? node.optionId : "")) ?? null
      }
      itemToStringLabel={(item) => item.label}
      isItemEqualToValue={(a, b) => a.id === b.id}
      filter={(item, query) => item.search.toLocaleLowerCase().includes(query.toLocaleLowerCase())}
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
          <Combobox.Popup
            render={(renderProps, state) => (
              <div {...renderProps} inert={!state.open} aria-hidden={!state.open || undefined} />
            )}
            className={cn(
              surfaceMotion({ kind: "popup" }),
              "max-h-72 w-(--anchor-width) overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg",
            )}
          >
            <Combobox.Empty className="p-3 text-sm">{t("condition_no_candidates")}</Combobox.Empty>
            <Combobox.List>
              {(item: Choice) => (
                <Combobox.Item
                  key={item.id}
                  value={item}
                  disabled={item.invalid}
                  className={cn(
                    controlMotion,
                    "flex min-h-11 cursor-default items-center gap-2 rounded-md p-2 text-sm wrap-anywhere data-highlighted:bg-accent data-disabled:opacity-50",
                  )}
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
  );
}

export function ConditionErrorNotice({
  id,
  invalid,
  missing,
  selectedInvalid,
}: {
  id: string;
  invalid: boolean;
  missing: boolean;
  selectedInvalid?: boolean;
}) {
  const { t } = useI18n();
  return (
    <>
      {(invalid || missing || selectedInvalid) && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {missing ? t("editor_missing_reference") : t("condition_invalid")}
        </p>
      )}
    </>
  );
}

export function ConditionActions({
  node,
  depth,
  disabled,
  onChange,
  onFocus,
}: Pick<NodeProps, "depth" | "disabled" | "node" | "onChange"> & {
  onFocus: (target: "last" | "node") => void;
}) {
  const { t } = useI18n();
  return (
    <>
      {node.kind !== "not" && (
        <Button
          type="button"
          variant="outline"
          disabled={disabled || depth >= conditionLimits.depth}
          onClick={() => {
            onFocus("node");
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
            onFocus("node");
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
            onFocus("last");
            onChange({ kind: "and", children: [node, emptyLeaf()] });
          }}
        >
          {t("condition_group")}
        </Button>
      )}
    </>
  );
}
