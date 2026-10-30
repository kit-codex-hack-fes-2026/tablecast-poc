import type { ReactNode } from "react";
import {
  ChevronDown,
  Eraser,
  FileStack,
  FlaskConical,
  LayoutDashboard,
  MessagesSquare,
  Monitor,
  RefreshCw,
  RotateCw,
  Tablet,
  Ticket,
  Users,
} from "lucide-react";
import type { DemoDisplay } from "./demo-session";
import { ErrorNotice } from "../../components/error-notice";
import { Skeleton } from "../../components/ui/skeleton";
import { useI18n } from "../../i18n/locale";
import { DemoViewport } from "./demo-viewport";

export function DemoPending({
  device = "ipad",
  portrait = false,
  error,
  onRetry,
}: DemoDisplay & { error?: unknown; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <main
      data-page-motion
      className="flex h-dvh flex-col bg-background [view-transition-name:tablecast-page]"
    >
      <header className="z-10 shrink-0 border-b border-border bg-card">
        <div className="flex h-16 items-center gap-2 overflow-hidden p-2" aria-busy={!error}>
          <div className="flex shrink-0 items-center gap-2 px-2 text-primary">
            <FlaskConical className="size-5" aria-hidden="true" />
            <h1 className="sr-only xl:not-sr-only xl:text-sm xl:font-semibold">
              {t("demo_title")}
            </h1>
          </div>
          <PendingSelect
            icon={device === "browser" ? <Monitor /> : <Tablet />}
            label={t("demo_display")}
            width="w-32"
          />
          <PendingAction icon={<RotateCw />} label={t("demo_rotate")} />
          <span aria-hidden="true" className="h-6 shrink-0 border-l border-border" />
          <PendingSelect icon={<FileStack />} label={t("demo_configuration")} width="w-44" />
          <PendingAction icon={<RefreshCw />} label={t("demo_reload")} />
          <span aria-hidden="true" className="h-6 shrink-0 border-l border-border" />
          <PendingSelect icon={<Ticket />} label={t("demo_plan")} width="w-32" />
          <PendingSelect icon={<Users />} label={t("demo_guests")} width="w-32" />
          <PendingAction icon={<MessagesSquare />} label={t("demo_proactive")} />
          <span aria-hidden="true" className="ml-auto h-6 shrink-0 border-l border-border" />
          <PendingAction icon={<Eraser />} label={t("demo_reset")} />
          <PendingAction icon={<LayoutDashboard />} label={t("admin_live")} />
        </div>
        <ErrorNotice error={error} onRetry={onRetry} />
      </header>
      <DemoViewport device={device} portrait={portrait} />
    </main>
  );
}

function PendingSelect({ icon, label, width }: { icon: ReactNode; label: string; width: string }) {
  return (
    <div
      aria-hidden="true"
      className={`flex h-12 min-w-20 max-w-44 shrink-0 items-center gap-2 rounded-lg border border-border px-3 text-muted-foreground ${width}`}
    >
      <span className="shrink-0 [&_svg]:size-4">{icon}</span>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span className="max-w-full truncate text-xs">{label}</span>
        <Skeleton className="h-3.5 w-full" />
      </div>
      <ChevronDown className="size-4 shrink-0" />
    </div>
  );
}

function PendingAction({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-12 min-w-11 shrink-0 flex-col items-center justify-center gap-1 whitespace-nowrap rounded-xl px-2 text-xs text-muted-foreground [&_svg]:size-4"
    >
      {icon}
      {label}
    </div>
  );
}
