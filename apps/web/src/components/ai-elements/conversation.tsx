// AI ElementsのConversationを採用し、不要なダウンロード操作を省く。
// https://elements.ai-sdk.dev/components/conversation
import type { ComponentProps } from "react";
import { ArrowDown } from "lucide-react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { Button } from "../ui/button";
import { cn } from "tailwind-variants";

export function Conversation({ className, ...props }: ComponentProps<typeof StickToBottom>) {
  return (
    <StickToBottom
      className={cn("relative flex-1 min-h-0 overflow-hidden", className)}
      initial="instant"
      resize="instant"
      role="log"
      {...props}
    />
  );
}
export function ConversationContent({
  className,
  ...props
}: ComponentProps<typeof StickToBottom.Content>) {
  return (
    <StickToBottom.Content
      className={cn("flex flex-col gap-3 pt-3 pb-12 pr-2", className)}
      {...props}
    />
  );
}
export function ConversationScrollButton({
  label,
  followLabel = label,
}: {
  label: string;
  followLabel?: string;
}) {
  const { isAtBottom, scrollToBottom, stopScroll, escapedFromLock } = useStickToBottomContext();
  return (
    <Button
      className="absolute bottom-2 right-2 h-9 rounded-full border-primary/30 bg-card px-3 text-xs shadow-sm"
      aria-pressed={!escapedFromLock && isAtBottom}
      variant="outline"
      onClick={() => {
        if (!escapedFromLock && isAtBottom) stopScroll();
        else void scrollToBottom();
      }}
    >
      <ArrowDown className="size-4" aria-hidden="true" />
      {!escapedFromLock && isAtBottom ? followLabel : label}
    </Button>
  );
}
