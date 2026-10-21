import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "tailwind-variants";
import { controlMotion, surfaceMotion } from "./motion-variants";
export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;
/**
 * 装飾した候補を同じ見た目で選ぶ場合に使う。
 * Selectがvalue/defaultValue/onValueChange/itemsを所有し、SelectTrigger+SelectValueで現在値、SelectContent+SelectItem(value)で候補を組み立てる。
 * triggerに名前を付ける。
 * 単純な文字候補はNativeSelectを優先する。
 * Portal内のスタイルは標準テーマを使う。
 */
export function SelectTrigger({
  className,
  children,
  showIndicator = true,
  ...props
}: SelectPrimitive.Trigger.Props & { showIndicator?: boolean }) {
  return (
    <SelectPrimitive.Trigger
      {...props}
      className={(state) =>
        cn(
          controlMotion,
          "flex min-h-12 min-w-0 w-full items-center justify-between gap-2 rounded-xl border border-input bg-card bg-(image:--surface-sheen) shadow-control hover:border-control-edge-hover hover:bg-control-hover px-3 py-2 text-base text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          typeof className === "function" ? className(state) : className,
        )
      }
    >
      {children}
      {showIndicator && (
        <SelectPrimitive.Icon className="ms-auto flex size-4 shrink-0 items-center justify-center">
          <ChevronsUpDown className="size-4 shrink-0" />
        </SelectPrimitive.Icon>
      )}
    </SelectPrimitive.Trigger>
  );
}
export function SelectContent({ className, children, ...props }: SelectPrimitive.Popup.Props) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        className="z-50"
        sideOffset={6}
        align="start"
        alignItemWithTrigger={false}
      >
        <SelectPrimitive.Popup
          render={(renderProps, state) => (
            <div {...renderProps} inert={!state.open} aria-hidden={!state.open || undefined} />
          )}
          {...props}
          className={(state) =>
            cn(
              surfaceMotion({ kind: "popup" }),
              "max-h-80 min-w-56 overflow-y-auto rounded-2xl border border-border bg-card p-2 text-foreground shadow-lg",
              typeof className === "function" ? className(state) : className,
            )
          }
        >
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}
export function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      {...props}
      className={(state) =>
        cn(
          controlMotion,
          "relative flex min-h-11 cursor-default items-center gap-2 rounded-md py-2 pl-8 pr-3 text-base outline-none data-highlighted:bg-secondary data-disabled:pointer-events-none data-disabled:opacity-50",
          typeof className === "function" ? className(state) : className,
        )
      }
    >
      <SelectPrimitive.ItemIndicator className="absolute left-2">
        <Check className="size-4" />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}
