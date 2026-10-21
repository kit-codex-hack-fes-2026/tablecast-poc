import type { ComponentProps } from "react";
import { cn } from "tailwind-variants";

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
        "border-b border-border bg-surface-subtle text-xs font-semibold leading-relaxed text-muted-foreground px-4 py-3",
        className,
      )}
      {...props}
    />
  );
}
export function TableCell({ className, scope, ...props }: ComponentProps<"th">) {
  const Tag = scope ? "th" : "td";
  return (
    <Tag
      data-slot="table-cell"
      scope={scope}
      className={cn(
        "border-b border-border/70 text-sm leading-relaxed align-middle px-4 py-3",
        className,
      )}
      {...props}
    />
  );
}
