import { cn } from "cn";
import type { ComponentProps } from "react";

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <table
      data-slot="table"
      className={cn("w-full border-collapse text-left text-base", className)}
      {...props}
    />
  );
}
export function TableHead({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "border-b border-border bg-muted text-sm font-medium text-muted-foreground p-3",
        className,
      )}
      {...props}
    />
  );
}
export function TableCell({ className, ...props }: ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn("border-b border-border text-sm tabular-nums p-3", className)}
      {...props}
    />
  );
}
