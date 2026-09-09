import { cn } from "cn";
import { GripVertical } from "lucide-react";
import {
  Group,
  Panel,
  Separator,
  type GroupProps,
  type SeparatorProps,
} from "react-resizable-panels";

export function ResizablePanelGroup({ className, ...props }: GroupProps) {
  return <Group className={cn("flex w-full min-h-0 min-w-0", className)} {...props} />;
}

export const ResizablePanel = Panel;

export function ResizableHandle({ className, ...props }: SeparatorProps) {
  return (
    <Separator
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
