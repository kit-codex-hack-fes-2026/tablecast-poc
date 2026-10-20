import { tv } from "tailwind-variants";
export const badgeVariants = tv({
  base: "group/badge inline-flex min-h-6 min-w-0 w-fit max-w-full items-center justify-center gap-1 rounded-4xl border border-transparent px-2 py-0.5 text-sm leading-snug font-medium whitespace-normal wrap-anywhere transition-colors duration-150 motion-reduce:transition-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [a,button]:min-h-11 [a,button]:min-w-11 [a,button]:px-3 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3! [&>svg]:shrink-0",
  variants: {
    variant: {
      success: "bg-success-soft text-success [a]:hover:bg-muted [a]:hover:text-muted-foreground",
      info: "bg-info-soft text-info",
      warning: "bg-warning-soft text-warning",
      inactive:
        "border-border bg-secondary text-muted-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
      active:
        "border-border bg-success/10 text-success [a]:hover:bg-muted [a]:hover:text-muted-foreground",
      default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
      secondary: "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
      destructive:
        "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
      outline: "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
      ghost: "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
      link: "text-primary underline-offset-4 hover:underline",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});
