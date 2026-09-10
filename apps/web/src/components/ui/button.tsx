import { useHydrated } from "@tanstack/react-router";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import type { VariantProps } from "tailwind-variants";
import { buttonVariants } from "./button-variants";

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  const hydrated = useHydrated();
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={(state) =>
        buttonVariants({
          variant,
          size,
          className: typeof className === "function" ? className(state) : className,
        })
      }
      {...props}
      disabled={!hydrated || props.disabled}
    />
  );
}

export { Button };
