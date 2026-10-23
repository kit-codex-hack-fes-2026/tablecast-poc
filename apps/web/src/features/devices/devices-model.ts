import { tv } from "tailwind-variants";

export const selectionIcon = tv({
  base: "size-4",
  variants: { selected: { true: "visible", false: "invisible" } },
});
