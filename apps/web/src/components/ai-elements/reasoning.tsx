import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { Streamdown } from "streamdown";

// AI ElementsのReasoningを常時表示と既存MotionProviderへ合わせて採用する。
// https://elements.ai-sdk.dev/components/reasoning
const markdownComponents = {
  a: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  img: () => null,
  table: ({ children }: { children?: ReactNode }) => (
    <table className="w-full border-collapse text-left">{children}</table>
  ),
};

export function Reasoning({
  children,
  isStreaming,
  label,
}: {
  children: string;
  isStreaming: boolean;
  label: string;
}) {
  const reduced = useReducedMotion();
  return (
    <m.div
      data-ui="reasoning"
      initial={reduced ? false : { opacity: 0, transform: "translateY(4px)" }}
      animate={{ opacity: 1, transform: "translateY(0px)" }}
      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
    >
      <section>
        <div className="flex min-h-8 w-full items-center gap-2 text-left text-xs font-medium">
          <Sparkles className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{label}</span>
        </div>
        <div className="min-w-0">
          <div
            className="max-h-64 overflow-auto wrap-anywhere text-xs leading-relaxed text-muted-foreground"
            role="region"
            aria-label={label}
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- 横長の表と長い要約をキーボードでスクロールする。
            tabIndex={0}
          >
            <Streamdown
              mode={isStreaming ? "streaming" : "static"}
              isAnimating={isStreaming}
              controls={false}
              skipHtml
              components={markdownComponents}
            >
              {children}
            </Streamdown>
          </div>
        </div>
      </section>
    </m.div>
  );
}
