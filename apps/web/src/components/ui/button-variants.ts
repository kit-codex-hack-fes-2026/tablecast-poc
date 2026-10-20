import { tv } from "tailwind-variants";
export const buttonVariants = tv({
  base: "group/button inline-flex min-w-11 max-w-full shrink-0 items-center justify-center rounded-xl border border-transparent bg-clip-padding text-base leading-snug font-medium whitespace-normal wrap-anywhere transition-[color,background-color,border-color,box-shadow,translate] duration-150 outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  variants: {
    variant: {
      default:
        "border-primary bg-primary bg-(image:--control-sheen) text-primary-foreground shadow-control-dark hover:bg-primary-hover active:shadow-control-pressed",
      voice:
        "border-primary bg-primary bg-(image:--control-sheen) text-primary-foreground shadow-control-dark hover:bg-primary-hover active:shadow-control-pressed",
      outline:
        "border-control-edge bg-card bg-(image:--surface-sheen) text-foreground shadow-control hover:border-control-edge-hover hover:bg-control-hover aria-expanded:bg-control-selected active:shadow-control-pressed",
      secondary:
        "border-control-edge bg-control bg-(image:--surface-sheen) text-secondary-foreground shadow-control hover:border-control-edge-hover hover:bg-control-hover aria-expanded:bg-control-selected active:shadow-control-pressed",
      ghost:
        "hover:bg-control-hover hover:text-foreground aria-expanded:bg-control-selected aria-expanded:text-foreground dark:hover:bg-control-hover/50",
      destructive:
        "border-destructive-border bg-destructive-soft bg-(image:--surface-sheen) text-destructive shadow-control hover:border-destructive-border-hover hover:bg-destructive-hover active:bg-destructive-selected active:shadow-control-pressed focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
      link: "text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-current",
    },
    size: {
      text: "h-auto min-h-11 gap-1 px-0 py-2 text-sm underline underline-offset-4",
      default: "h-auto min-h-12 gap-2 px-4 py-3",
      xs: "h-auto min-h-11 gap-1 rounded-lg p-2 text-sm in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
      sm: "h-auto min-h-11 gap-1 rounded-lg px-3 py-2 text-sm in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3.5",
      lg: "h-auto min-h-14 gap-2 px-5 py-3",
      icon: "size-12 min-h-12",
      "icon-xs":
        "size-11 min-h-11 rounded-lg in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
      "icon-sm": "size-11 min-h-11 rounded-lg in-data-[slot=button-group]:rounded-lg",
      "icon-lg": "size-14 min-h-14",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});
