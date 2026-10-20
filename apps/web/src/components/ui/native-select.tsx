import { ChevronDown } from "lucide-react";
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
    <span className="relative inline-grid min-w-0 max-w-full align-middle">
      <select
        data-slot="native-select"
        className={cn(
          "peer min-h-12 min-w-0 max-w-full rounded-xl border border-input bg-card px-3 py-2 text-base text-foreground inset-shadow-field outline-none hover:border-control-edge-hover focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          className,
          !props.multiple && "appearance-none pr-10",
        )}
        {...props}
        disabled={!hydrated || props.disabled}
      />
      {!props.multiple && (
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground peer-disabled:opacity-50"
        />
      )}
    </span>
  );
}
