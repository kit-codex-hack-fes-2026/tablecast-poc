import { tv } from "tailwind-variants";
export const badgeVariants = tv({
  base: "group/badge inline-flex min-h-6 min-w-0 w-fit max-w-full items-center justify-center gap-1 rounded-lg border border-transparent px-2 py-1 text-sm leading-snug font-medium whitespace-normal wrap-anywhere transition-colors duration-150 motion-reduce:transition-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [a,button]:min-h-11 [a,button]:min-w-11 [a,button]:px-3 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3! [&>svg]:shrink-0",
  variants: {
    variant: {
      success: "bg-success-soft text-success [a,button]:hover:bg-success-hover",
      info: "bg-info-soft text-info [a,button]:hover:bg-info-hover",
      warning: "bg-warning-soft text-warning [a,button]:hover:bg-warning-hover",
      inactive:
        "border-border bg-secondary text-muted-foreground [a,button]:hover:bg-muted [a,button]:hover:text-muted-foreground",
      active:
        "border-success-border bg-success-soft text-success [a,button]:hover:bg-success-hover",
      default: "bg-primary text-primary-foreground [a,button]:hover:bg-primary/80",
      secondary: "bg-secondary text-secondary-foreground [a,button]:hover:bg-secondary/80",
      destructive:
        "bg-destructive-soft text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a,button]:hover:bg-destructive-hover",
      outline:
        "border-border text-foreground [a,button]:hover:bg-muted [a,button]:hover:text-muted-foreground",
      ghost: "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
      link: "text-primary underline-offset-4 hover:underline",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});
