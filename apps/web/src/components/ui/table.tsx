import { cn } from "cn";
import type { ComponentProps } from "react";

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <table
      data-slot="table"
      className={cn("w-full border-collapse text-left text-sm", className)}
      {...props}
    />
  );
}
export function TableHead({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "border-b border-border bg-muted px-3 py-3 text-xs font-medium text-muted-foreground",
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
      className={cn("border-b border-border px-3 py-3 text-sm tabular-nums", className)}
      {...props}
    />
  );
}
