import { controlMotion } from "./motion-variants";
import { Radio } from "@base-ui/react/radio";
import { cn } from "tailwind-variants";

export { RadioGroup } from "@base-ui/react/radio-group";

/**
 * 同時に一つだけ選ぶ短い候補。
 * RadioGroupへvalue/defaultValue/onValueChange、各RadioGroupItemへvalueを渡す。
 * fieldset/legendで集合を命名し、labelを44px以上にする。
 * 矢印キーで移動できる。
 * 複数選択はCheckboxを使う。
 */
export function RadioGroupItem({ className, ...props }: Radio.Root.Props) {
  return (
    <Radio.Root
      {...props}
      className={(state) =>
        cn(
          controlMotion,
          "flex size-6 shrink-0 items-center justify-center rounded-full border border-input data-checked:border-primary",
          typeof className === "function" ? className(state) : className,
        )
      }
    >
      <Radio.Indicator className="size-3 rounded-full bg-primary transition-[opacity,transform] duration-(--motion-press) ease-(--motion-ease-out) data-starting-style:opacity-0 data-ending-style:opacity-0 motion-safe:data-starting-style:[transform:scale(.8)] motion-safe:data-ending-style:[transform:scale(.8)] motion-reduce:transition-none" />
    </Radio.Root>
  );
}
