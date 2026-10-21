import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Check } from "lucide-react";
import { cn } from "tailwind-variants";
import { controlMotion } from "./motion-variants";

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
          controlMotion,
          "flex size-6 shrink-0 items-center justify-center rounded-sm border border-input data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground",
          typeof className === "function" ? className(state) : className,
        )
      }
    >
      <CheckboxPrimitive.Indicator className="flex transition-[opacity,transform] duration-(--motion-press) ease-(--motion-ease-out) data-starting-style:opacity-0 data-ending-style:opacity-0 motion-safe:data-starting-style:[transform:scale(.8)] motion-safe:data-ending-style:[transform:scale(.8)] motion-reduce:transition-none">
        <Check className="size-4" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
