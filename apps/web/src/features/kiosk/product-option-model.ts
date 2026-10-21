import { tv } from "tailwind-variants";

export const optionRow = tv({
  base: "flex min-h-14 min-w-0 items-center gap-3 rounded-lg border border-transparent p-3 text-base",
  variants: { selected: { true: "border-primary bg-surface-subtle" } },
});
