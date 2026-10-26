import type { ComponentProps } from "react";
// AI ElementsのConversationを採用し、不要なダウンロード操作を省く。
// https://elements.ai-sdk.dev/components/conversation
import { ArrowDown } from "lucide-react";
import { cn } from "tailwind-variants";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { Button } from "../ui/button";

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
    <StickToBottom.Content className={cn("flex flex-col gap-3 py-3 pr-2", className)} {...props} />
  );
}
export function ConversationScrollButton({ label }: { label: string }) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  if (isAtBottom) return null;
  return (
    <Button
      className="absolute bottom-2 right-2 z-20 h-11 rounded-full px-3 text-xs shadow-control-dark"
      onClick={() => {
        void scrollToBottom();
      }}
    >
      <ArrowDown className="size-4" aria-hidden="true" />
      {label}
    </Button>
  );
}
