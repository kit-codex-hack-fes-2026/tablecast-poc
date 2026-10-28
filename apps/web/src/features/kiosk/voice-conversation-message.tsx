import { AudioLines, Mic } from "lucide-react";
import { useIsPresent, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { forwardRef, type ReactNode } from "react";
import { Streamdown } from "streamdown";
import { cn, tv, type VariantProps } from "tailwind-variants";
import { useStickToBottomContext } from "use-stick-to-bottom";
import { time } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { type ConversationLine } from "./conversation-model";

const speakerBadge = tv({
  base: "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-2 py-0.5 font-semibold",
  variants: {
    colour: {
      assistant: "bg-primary/10 text-primary",
      guest: "bg-secondary text-secondary-foreground",
      sky: "bg-nav-workspace-soft text-nav-workspace",
      violet: "bg-nav-menu-soft text-nav-menu",
      amber: "bg-warning-soft text-warning",
      teal: "bg-nav-store-soft text-nav-store",
    },
  },
});

const speakerColours = ["sky", "violet", "amber", "teal"] as const;

function speakerColour(line: ConversationLine): VariantProps<typeof speakerBadge>["colour"] {
  if (line.role === "assistant") return "assistant";
  if (!line.speaker) return "guest";
  const hash = Array.from(`${line.streamId ?? ""}:${line.speaker}`).reduce(
    (sum, letter) => (sum * 31 + letter.charCodeAt(0)) | 0,
    0,
  );
  return speakerColours[Math.abs(hash) % speakerColours.length];
}

const markdownComponents = {
  a: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  img: () => null,
};

const transcriptAnimation = {
  animation: "fadeIn",
  duration: 150,
  sep: "char",
  stagger: 0,
  maxBacklogMs: 0,
} as const;

export // 行のIDと本文DOMを保ち、追加された発話だけを短く表示する。
const ConversationEntry = forwardRef<
  HTMLDivElement,
  { children: ReactNode; className?: string; pinned?: boolean }
>(function ConversationEntry({ children, className, pinned }, ref) {
  const present = useIsPresent();
  const reduced = useReducedMotion();
  const { escapedFromLock, isAtBottom } = useStickToBottomContext();
  const following = isAtBottom && !escapedFromLock;
  return (
    <m.div
      ref={ref}
      data-ui="conversation-entry"
      data-pinned={Boolean(pinned && following)}
      className={cn(
        className,
        pinned && "order-last py-2",
        pinned && following && "sticky bottom-0 z-10 rounded-xl bg-card",
      )}
      inert={!present}
      aria-hidden={!present || undefined}
      initial={reduced ? false : { opacity: 0, transform: "translateY(6px)" }}
      animate={{ opacity: 1, transform: "none" }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0 : 0.2, ease: [0.23, 1, 0.32, 1] }}
    >
      {children}
    </m.div>
  );
});

export function ConversationMessage({
  line,
  status,
  children,
}: {
  children?: ReactNode;
  line: ConversationLine;
  status?: string;
}) {
  const { locale, t } = useI18n();
  const reduced = useReducedMotion();
  return (
    <article
      data-role={line.role}
      data-live={Boolean(status)}
      className="group min-w-0 max-w-full w-fit data-[role=user]:ml-auto"
      lang={line.locale}
    >
      <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className={speakerBadge({ colour: speakerColour(line) })}>
          {line.role === "assistant" ? (
            <AudioLines className="size-3.5" aria-hidden="true" />
          ) : (
            <Mic className="size-3.5" aria-hidden="true" />
          )}
          {conversationSpeakerName(line, t)}
        </span>
        <span className="text-right tabular-nums">{status || time(line.createdAt, locale)}</span>
      </div>
      <div className="rounded-xl border border-border bg-card px-3 py-2 text-sm leading-relaxed text-foreground shadow-xs group-data-[role=user]:bg-secondary group-data-[live=true]:border-primary group-data-[live=true]:ring-1 group-data-[live=true]:ring-primary/20">
        {line.text ? (
          <Streamdown
            mode={status ? "streaming" : "static"}
            isAnimating={Boolean(status)}
            animated={status && !reduced ? transcriptAnimation : false}
            controls={false}
            components={markdownComponents}
          >
            {line.text}
          </Streamdown>
        ) : (
          <span className="flex items-center gap-3 text-muted-foreground">
            <span className="flex gap-1" aria-hidden="true">
              {[0, 1, 2].map((index) => (
                <span
                  key={index}
                  className="size-1.5 rounded-full bg-current motion-safe:animate-pulse"
                  style={{ animationDelay: `${index * 200}ms` }}
                />
              ))}
            </span>
            {status}
          </span>
        )}
        {children}
      </div>
      {line.interrupted && (
        <p className="mt-1 text-xs text-muted-foreground">{t("kiosk_interrupted")}</p>
      )}
      {line.displayIncomplete && (
        <p className="mt-1 text-xs text-muted-foreground">{t("kiosk_transcript_syncing")}</p>
      )}
      {line.synthetic && (
        <p className="mt-1 text-xs text-muted-foreground">{t("common_synthetic")}</p>
      )}
    </article>
  );
}

function conversationSpeakerName(line: ConversationLine, t: ReturnType<typeof useI18n>["t"]) {
  if (line.role === "assistant") return t("kiosk_assistant");
  if (!line.speaker) return t("kiosk_guest");
  const speaker =
    line.streamId && line.speaker.startsWith(`${line.streamId}:`)
      ? line.speaker.slice(line.streamId.length + 1)
      : line.speaker;
  return `${t("kiosk_speaker")} ${speaker}`;
}
