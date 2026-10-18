import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { cn } from "tailwind-variants";
import { Check } from "lucide-react";

/**
 * 独立した真偽値、複数選択に使う。
 * Base UI Rootのchecked/defaultChecked/onCheckedChange/name/disabled/indeterminateを利用する。
 * ラベル全体を44px以上の操作領域にし、必ず名前を付ける。
 * 排他的な選択はRadioGroup、長い選択肢一覧はNativeSelectへ。
 */
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
