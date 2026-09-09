import { Radio } from "@base-ui/react/radio";
import { cn } from "cn";

export { RadioGroup } from "@base-ui/react/radio-group";

export function RadioGroupItem({ className, ...props }: Radio.Root.Props) {
  return (
    <Radio.Root
      {...props}
      className={(state) =>
        cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full border border-input data-checked:border-primary",
          typeof className === "function" ? className(state) : className,
        )
      }
    >
      <Radio.Indicator className="size-3 rounded-full bg-primary" />
    </Radio.Root>
  );
}
