import {
  AudioLines,
  Check,
  MessageCircle,
  Mic,
  ShoppingBag,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";
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
      className="flex flex-1 flex-col items-center gap-3 py-2 text-center [@container_history_(max-height:360px)]:gap-2 [@container_history_(max-height:280px)]:py-0"
    >
      <VoiceWelcomeGraphic />
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
          variant="outline"
          size="lg"
          className="h-auto min-h-11 whitespace-normal bg-on-inverse px-4 py-2 text-inverse hover:bg-on-inverse"
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

function VoiceWelcomeGraphic() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none relative h-32 w-48 shrink-0 select-none [@container_history_(max-height:360px)]:hidden"
    >
      <span className="absolute inset-x-4 inset-y-0 rounded-full bg-muted/60" />
      <div className="absolute top-1 left-3 h-25 w-40 overflow-hidden rounded-2xl border border-border bg-card shadow-surface">
        <div className="flex h-6 items-center justify-between border-b border-border/60 px-2.5">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Mic className="size-2.5" />
            <span className="h-1 w-5 rounded-full bg-muted-foreground/30" />
          </span>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <span>あ</span>
            <span className="h-2 w-px bg-border" />
            <span>A</span>
          </span>
        </div>
        <div className="grid h-18 grid-cols-2 divide-x divide-border/60">
          <div className="flex flex-col items-start gap-2 p-2 text-muted-foreground">
            <MessageCircle className="size-5 self-end" />
            <span className="flex items-center gap-1 rounded-lg rounded-tl-sm bg-muted p-1.5">
              <AudioLines className="size-3" />
              <span className="h-1 w-4 rounded-full bg-muted-foreground/35" />
            </span>
          </div>
          <div className="flex flex-col items-center gap-1 p-2">
            <span className="flex h-8 w-12 items-center justify-center rounded-lg bg-muted">
              <UtensilsCrossed className="size-4 text-muted-foreground" />
            </span>
            <span className="h-1 w-10 rounded-full bg-muted-foreground/30" />
            <span className="h-1 w-6 self-start rounded-full bg-muted-foreground/20" />
          </div>
        </div>
      </div>
      <span className="absolute bottom-0 left-0 flex h-12 w-26 items-center justify-center gap-2 rounded-2xl rounded-tl-sm bg-primary text-primary-foreground shadow-control-dark">
        <Mic className="size-4 opacity-70" />
        <AudioLines className="size-8" />
      </span>
      <span className="absolute top-7 right-0 flex size-9 items-center justify-center rounded-full border border-border bg-card text-primary shadow-surface">
        <Sparkles className="size-5" />
      </span>
      <span className="absolute right-0 bottom-1 flex h-11 w-17 items-center justify-center gap-1.5 rounded-xl border border-border bg-card shadow-surface">
        <ShoppingBag className="size-5 text-foreground" />
        <Check className="size-4 text-success" />
      </span>
    </div>
  );
}
