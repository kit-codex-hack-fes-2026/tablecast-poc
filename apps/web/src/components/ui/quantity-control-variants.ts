import { tv } from "tailwind-variants";

/** カゴ・商品詳細・追加項目の数量操作で、数値幅と増減ボタンの余白を揃える。 */
export const quantityControl = tv({
  slots: {
    group:
      "inline-flex shrink-0 items-center rounded-xl border border-input bg-card p-1 inset-shadow-field hover:border-control-edge-hover focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
    value:
      "h-11 w-10 min-w-10 shrink-0 bg-transparent p-0 text-center text-base tabular-nums outline-none",
  },
});
