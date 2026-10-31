import type { ReactNode } from "react";
import { Check, CircleAlert, LoaderCircle, Pause } from "lucide-react";
import { Badge } from "../ui/badge";

// AI ElementsのToolを、アプリが公開している処理状態だけで表示する。
// https://elements.ai-sdk.dev/components/tool
const busy = {
  Icon: LoaderCircle,
  variant: "info",
  className: "motion-safe:animate-spin text-primary",
} as const;
const appearances = {
  requested: busy,
  running: busy,
  completed: { Icon: Check, variant: "success", className: "" },
  error: { Icon: CircleAlert, variant: "destructive", className: "text-destructive" },
  interrupted: { Icon: Pause, variant: "inactive", className: "" },
} as const;

export function Tool({
  title,
  state,
  statusLabel,
  children,
}: {
  children?: ReactNode;
  state: "completed" | "error" | "interrupted" | "requested" | "running";
  statusLabel: string;
  title: string;
}) {
  const appearance = appearances[state];
  const Icon = appearance.Icon;
  const header = (
    <>
      <Icon className={`size-4 shrink-0 ${appearance.className}`} aria-hidden="true" />
      <span className="min-w-0 flex-1 text-xs font-medium">{title}</span>
      <Badge variant={appearance.variant} className="shrink-0 text-xs">
        {statusLabel}
      </Badge>
    </>
  );
  return (
    <div
      className="min-w-0 rounded-xl border border-border bg-background text-xs"
      data-tool-state={state}
    >
      <div className="flex min-h-11 items-center gap-2 p-2">{header}</div>
      {children && (
        <div className="space-y-2 border-t border-border px-3 py-2 leading-relaxed">{children}</div>
      )}
    </div>
  );
}
