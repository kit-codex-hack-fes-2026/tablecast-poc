import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { cn } from "cn";
import { Check } from "lucide-react";

export function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      {...props}
      className={(state) =>
        cn(
          "flex size-6 shrink-0 items-center justify-center rounded-sm border border-input data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground",
          typeof className === "function" ? className(state) : className,
        )
      }
    >
      <CheckboxPrimitive.Indicator className="flex">
        <Check className="size-4" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
