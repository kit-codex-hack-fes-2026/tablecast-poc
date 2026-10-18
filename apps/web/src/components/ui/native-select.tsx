import { useHydrated } from "@tanstack/react-router";
import { cn } from "tailwind-variants";
import type { ComponentProps } from "react";

/**
 * 単純な文字の候補ではOS標準選択を優先する。
 * HTML selectのvalue/defaultValue/onChange/name/disabledを使い、子にoptionを置く。
 * ラベルと関連付ける。
 * SSR直後はhydrationまで無効。
 * 装飾した候補が必要な場合だけSelectを選ぶ。
 */
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  const hydrated = useHydrated();
  return (
    <select
      data-slot="native-select"
      className={cn(
        "min-h-12 max-w-full rounded-lg border border-input bg-card px-3 py-2 text-base text-foreground",
        className,
      )}
      {...props}
      disabled={!hydrated || props.disabled}
    />
  );
}
