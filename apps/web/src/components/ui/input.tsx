import { controlMotion } from "./motion-variants";
import { useHydrated } from "@tanstack/react-router";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "tailwind-variants";
import * as React from "react";

/**
 * 低水準の入力。
 * HTML inputのprops、classNameを受け取る。
 * idとlabelを必ず関連付ける。
 * placeholderをラベルにしない。
 * 業務フォームではuseAppFormのTextField/NumberFieldを優先し、errorsはFieldErrorsへ接続する。
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  const hydrated = useHydrated();
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        controlMotion,
        "h-12 w-full min-w-0 rounded-xl border border-input bg-card inset-shadow-field hover:border-control-edge-hover p-3 text-base outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
      readOnly={!hydrated || props.readOnly}
    />
  );
}

export { Input };
