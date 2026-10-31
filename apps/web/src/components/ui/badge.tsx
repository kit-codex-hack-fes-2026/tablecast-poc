import type { VariantProps } from "tailwind-variants";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { badgeVariants } from "./badge-variants";

/**
 * 操作ではなく対象の状態を表示する。
 * childrenに短い状態名、variantにdefault/secondary/outline/destructive/success/info/warning/inactiveを指定する。
 * 色だけで区別せず本文を付ける。
 * renderでリンクにする場合だけ操作領域を確保する。
 * badgeVariantsを使うBadge以外へ状態の色を複製しない。
 */
function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: badgeVariants({ variant, className }),
      },
      props,
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  });
}

export { Badge };
