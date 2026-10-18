import { cn } from "tailwind-variants";
import { useHydrated } from "@tanstack/react-router";
import { GripVertical } from "lucide-react";
import {
  Group,
  Panel,
  Separator,
  type GroupProps,
  type SeparatorProps,
} from "react-resizable-panels";

/**
 * react-resizable-panelsのGroup/Panel/Separatorを利用した分割。
 * Groupのorientation、PanelのdefaultSize/minSize、Handleのaria-labelを指定する。
 * キーボード操作と最小幅を保ち、狭い画面では呼出し元が縦並びにする。
 * hydration前のHandleは無効。
 * 独自drag実装を作らない。
 */
export function ResizablePanelGroup({ className, ...props }: GroupProps) {
  return <Group className={cn("flex w-full min-h-0 min-w-0", className)} {...props} />;
}

export const ResizablePanel = Panel;

export function ResizableHandle({ className, disabled, ...props }: SeparatorProps) {
  const hydrated = useHydrated();
  return (
    <Separator
      disabled={!hydrated || disabled}
      aria-disabled={!hydrated || disabled}
      className={cn(
        "group relative z-10 flex w-2 shrink-0 items-center justify-center bg-transparent outline-none transition-colors hover:bg-border focus-visible:bg-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset aria-[orientation=horizontal]:h-2 aria-[orientation=horizontal]:w-full",
        className,
      )}
      {...props}
    >
      <span className="flex h-8 w-2 items-center justify-center rounded-full bg-border text-foreground group-aria-[orientation=horizontal]:rotate-90">
        <GripVertical className="size-4 shrink-0" aria-hidden="true" />
      </span>
    </Separator>
  );
}
