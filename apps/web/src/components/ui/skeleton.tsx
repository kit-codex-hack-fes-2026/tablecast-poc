import { cn } from "tailwind-variants";
import type { ComponentProps } from "react";
/**
 * 読み込み中の形状のみを表す。
 * classNameとHTML div propsを受け取る。
 * Skeleton自身に完了や状態の意味はないため、通常はrole=statusと翻訳済みの読み込みラベルを備えたLoadingStateを使う。
 * motion-reduceで点滅を抑える。
 */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("rounded-md bg-muted motion-safe:animate-pulse", className)}
      {...props}
    />
  );
}
