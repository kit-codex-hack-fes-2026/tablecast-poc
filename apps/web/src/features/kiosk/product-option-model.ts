import { tv } from "tailwind-variants";

export const optionRow = tv({
  base: "flex min-h-11 min-w-0 items-center gap-2 rounded-2xl border border-transparent p-2 text-base",
  variants: { selected: { true: "border-control-edge bg-control" } },
});
