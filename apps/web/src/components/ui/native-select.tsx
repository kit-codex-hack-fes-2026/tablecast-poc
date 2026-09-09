import { useHydrated } from "@tanstack/react-router";
import { cn } from "tailwind-variants";
import type { ComponentProps } from "react";

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
