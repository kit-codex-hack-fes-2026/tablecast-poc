import { AudioLines, Check, Mic, UtensilsCrossed } from "lucide-react";
import { useEffect, useRef } from "react";
import type { VoiceView } from "./voice-model";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";

export function VoiceWelcome({
  hasContent,
  view,
  ...props
}: {
  disabled?: boolean;
  hasContent: boolean;
  onStart: () => void;
  view: VoiceView;
}) {
  if (hasContent || !["idle", "paused"].includes(view.status)) return null;
  return <WelcomeContent {...props} />;
}

function WelcomeContent({ onStart, disabled }: { disabled?: boolean; onStart: () => void }) {
  const { t } = useI18n();
  const pulse = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const update = () => {
      if (pulse.current)
        pulse.current.style.animationPlayState = document.hidden ? "paused" : "running";
    };
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return (
    <div
      data-ui="voice-welcome"
      className="flex flex-1 flex-col items-center justify-center gap-4 py-3 text-center [@container_history_(max-height:360px)]:gap-2 [@container_history_(max-height:280px)]:py-0"
    >
      <div
        aria-hidden="true"
        className="relative h-28 w-40 shrink-0 [@container_history_(max-height:360px)]:hidden"
      >
        <span className="absolute inset-1 rounded-full bg-muted/60" />
        <span className="absolute top-0 left-0 flex h-22 w-30 flex-col gap-2 rounded-2xl border border-border bg-card p-3 shadow-surface">
          <UtensilsCrossed className="size-6 rounded-lg bg-muted p-1 text-muted-foreground" />
          <span className="h-1.5 w-16 rounded-full bg-muted-foreground/35" />
          <span className="h-1.5 w-11 rounded-full bg-muted-foreground/25" />
        </span>
        <span className="absolute right-1 bottom-0 flex h-17 w-25 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-control-dark">
          <AudioLines className="size-10" />
        </span>
        <span className="absolute top-4 right-1 flex size-8 items-center justify-center rounded-full border border-border bg-card text-primary shadow-surface">
          <Check className="size-5" />
        </span>
      </div>
      <div className="space-y-2">
        <h3 className="text-xl font-semibold leading-snug">{t("kiosk_welcome_title")}</h3>
        <p className="max-w-72 text-sm leading-relaxed text-muted-foreground [@container_history_(max-height:280px)]:hidden">
          {t("kiosk_welcome_description")}
        </p>
      </div>
      <span className="relative inline-flex max-w-full rounded-xl">
        <span
          ref={pulse}
          data-ui="voice-welcome-pulse"
          aria-hidden="true"
          className="pointer-events-none absolute -inset-1 rounded-2xl border-2 border-primary/35 motion-safe:animate-pulse motion-reduce:hidden"
          style={{ animationIterationCount: 3, animationTimingFunction: "var(--motion-ease-out)" }}
        />
        <Button
          size="lg"
          className="h-auto min-h-11 whitespace-normal px-4 py-2"
          onClick={onStart}
          disabled={disabled}
        >
          <Mic aria-hidden="true" />
          {t("kiosk_welcome_start")}
        </Button>
      </span>
    </div>
  );
}
