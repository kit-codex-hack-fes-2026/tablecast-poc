import { Select as SelectPrimitive } from "@base-ui/react/select";
import { cn } from "cn";
import { Check, ChevronsUpDown } from "lucide-react";
export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;
export function SelectTrigger({ className, children, ...props }: SelectPrimitive.Trigger.Props) {
  return (
    <SelectPrimitive.Trigger
      {...props}
      className={(state) =>
        cn(
          "flex min-h-12 w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 py-2 text-base text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          typeof className === "function" ? className(state) : className,
        )
      }
    >
      {children}
      <SelectPrimitive.Icon>
        <ChevronsUpDown className="size-4 shrink-0" />
      </SelectPrimitive.Icon>
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
          {...props}
          className={(state) =>
            cn(
              "max-h-80 min-w-56 overflow-y-auto rounded-lg border border-border bg-card p-1 text-foreground shadow-lg",
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
