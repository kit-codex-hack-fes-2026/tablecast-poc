import { tv } from "tailwind-variants";

export const tabVariants = tv({
  variants: { size: { default: "min-h-11", guest: "min-h-14" } },
  defaultVariants: { size: "default" },
  base: "relative inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-control-edge bg-card bg-(image:--surface-sheen) px-4 py-2.5 text-sm font-medium text-foreground shadow-control whitespace-nowrap outline-none transition-[color,background-color,border-color,box-shadow,translate] duration-150 hover:bg-control-hover hover:border-control-edge-hover active:translate-y-px active:shadow-control-pressed data-active:border-primary data-active:bg-primary data-active:bg-(image:--control-sheen) data-active:text-primary-foreground data-active:shadow-control-dark data-active:hover:bg-primary-hover data-active:hover:border-primary data-active:hover:text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:translate-y-0 [&_svg]:size-4 [&_svg]:shrink-0",
});
