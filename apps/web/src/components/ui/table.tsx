import { cn } from "tailwind-variants";
import type { ComponentProps } from "react";

/**
 * 静的な表構造。
 * Tableはtable、TableHeadはth、TableCellはtdのpropsを渡す。
 * captionで内容を命名し、列見出しにはscope=colを付ける。
 * 横スクロールは外側で確保する。
 * 検索やページ分割がある一覧はDataTableを利用する。
 */
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
