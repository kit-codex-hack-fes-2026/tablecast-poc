import type { RefObject } from "react";
import { Toast } from "@base-ui/react/toast";
import {
  Bell,
  Check,
  CircleAlert,
  Languages,
  PackageCheck,
  ShoppingBag,
  UserRound,
  X,
} from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { tv } from "tailwind-variants";
import { useI18n } from "../i18n/locale";
import { Button } from "./ui/button";

const icons = {
  product: ShoppingBag,
  order: PackageCheck,
  staff: Bell,
  language: Languages,
  member: UserRound,
};
export type ActionToastData = { icon?: keyof typeof icons };
export const actionToastTimeout = 4000;
const toastSurface = tv({
  base: "group/toast pointer-events-auto w-96 max-w-[var(--available-width)] overflow-hidden rounded-2xl border p-3 shadow-xl transition-[opacity,transform] duration-(--motion-state) ease-(--motion-ease-out) data-starting-style:opacity-0 data-ending-style:opacity-0 motion-safe:data-starting-style:translate-y-2 motion-safe:data-ending-style:translate-y-2 data-limited:hidden motion-reduce:transition-none",
  variants: {
    failure: {
      false: "border-success-border bg-success-soft text-success",
      true: "border-destructive-border bg-destructive-soft text-destructive",
    },
  },
});

/** 消去と停止はBase UIが所有し、進捗も同じhover・focus・window状態に合わせる。 */
export function ActionToasts({ container }: { container: RefObject<HTMLElement | null> }) {
  const { toasts } = Toast.useToastManager<ActionToastData>();
  const { t } = useI18n();
  const [focused, setFocused] = useState(true);
  useEffect(() => {
    const blur = () => setFocused(false);
    const focus = () => setFocused(true);
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    return () => {
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
    };
  }, []);
  const anchor = container.current?.querySelector(
    '[data-ui="menu-categories"], [data-ui="pane-heading"]',
  );
  return (
    <Toast.Viewport className="pointer-events-none absolute inset-0 z-50 outline-none">
      {toasts.map((toast) => {
        const Icon =
          toast.type === "error" ? CircleAlert : toast.data?.icon ? icons[toast.data.icon] : Check;
        return (
          <Toast.Positioner
            key={toast.id}
            toast={toast}
            anchor={anchor}
            side="bottom"
            align="end"
            sideOffset={16}
            collisionBoundary={container.current ?? undefined}
            collisionPadding={16}
            collisionAvoidance={{ side: "shift", align: "shift" }}
            className="pointer-events-none z-50"
          >
            <Toast.Root
              toast={toast}
              className={toastSurface({ failure: toast.type === "error" })}
              render={(rootProps, state) => (
                <div {...rootProps}>
                  {rootProps.children}
                  <ToastCountdown
                    key={toast.updateKey}
                    duration={toast.timeout ?? actionToastTimeout}
                    paused={state.expanded || !focused}
                  />
                </div>
              )}
            >
              <Toast.Content className="flex items-center gap-3">
                <Icon aria-hidden className="size-6 shrink-0" />
                <Toast.Title className="min-w-0 flex-1 text-sm font-bold" />
                <Toast.Close
                  aria-hidden={false}
                  aria-label={t("common_close")}
                  render={<Button variant="ghost" size="icon-sm" />}
                >
                  <X aria-hidden />
                </Toast.Close>
              </Toast.Content>
            </Toast.Root>
          </Toast.Positioner>
        );
      })}
    </Toast.Viewport>
  );
}

function ToastCountdown({ duration, paused }: { duration: number; paused: boolean }) {
  const element = useRef<HTMLDivElement>(null);
  const animation = useRef<Animation | undefined>(undefined);
  const reduced = useReducedMotion();
  const playback = useEffectEvent((progress: Animation | undefined) => {
    if (paused) progress?.pause();
    else progress?.play();
  });
  useEffect(() => {
    const progress = element.current?.animate(
      [{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }],
      { duration, fill: "forwards", easing: reduced ? "steps(4, end)" : "linear" },
    );
    animation.current = progress;
    playback(progress);
    return () => progress?.cancel();
  }, [duration, reduced]);
  useEffect(() => {
    if (paused) animation.current?.pause();
    else animation.current?.play();
  }, [paused]);
  if (duration === 0) return null;
  return (
    <div aria-hidden className="mt-2 h-1 overflow-hidden rounded-full bg-current/10">
      <div
        ref={element}
        data-ui="toast-progress"
        className="h-full origin-left rounded-full bg-current opacity-50"
      />
    </div>
  );
}
