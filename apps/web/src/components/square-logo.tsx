import { cn } from "tailwind-variants";

/** 公式SVGを変形せず表示する。配布元: https://design.block.xyz/square/guidelines/logo */
export function SquareLogo({
  compact = false,
  className,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <img
      src={compact ? "/brand/square-symbol-black.svg" : "/brand/square-primary-black.svg"}
      width={compact ? 70 : 599}
      height={compact ? 70 : 151}
      alt={compact ? "" : "Square"}
      aria-hidden={compact || undefined}
      className={cn("shrink-0 object-contain", compact ? "size-5" : "h-6 w-auto", className)}
    />
  );
}
