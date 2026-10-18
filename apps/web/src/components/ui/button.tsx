import { useHydrated } from "@tanstack/react-router";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import type { VariantProps } from "tailwind-variants";
import { buttonVariants } from "./button-variants";

/**
 * 操作を実行する部品。
 * variantは主操作default、補助outline/secondary/ghost、音声開始専用voice、破壊操作destructive、文中link。
 * sizeは通常default、卓上の主操作lg、アイコンのみicon系。
 * disabled・aria-busyは呼出し元の処理状態で指定する。
 * アイコンのみならaria-labelが必須。
 * 遷移はrenderにLinkを渡しnativeButton={false}とrole="link"を指定する。
 * 状態だけならBadgeを使う。
 * buttonVariantsはこの部品が所有する見た目の正本で、別のサイズ表を作らない。
 */
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
