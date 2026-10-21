import { FlaskConical } from "lucide-react";
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
            <FlaskConical className="size-5" />
            <h1 className="sr-only xl:not-sr-only xl:text-sm xl:font-semibold">
              {t("demo_title")}
            </h1>
          </div>
          {[
            { id: "device", width: "w-36" },
            { id: "rotate", width: "w-11" },
            { id: "configuration", width: "w-44" },
            { id: "reload", width: "w-11" },
            { id: "plan", width: "w-32" },
            { id: "guests", width: "w-20" },
          ].map(({ id, width }) => (
            <Skeleton key={id} className={`h-12 shrink-0 ${width}`} />
          ))}
        </div>
        <ErrorNotice error={error} onRetry={onRetry} />
      </header>
      <DemoViewport device={device} portrait={portrait} />
    </main>
  );
}
