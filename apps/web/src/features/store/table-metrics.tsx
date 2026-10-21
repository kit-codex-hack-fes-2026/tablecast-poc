import type { TableState } from "@tablecast/api/schema";
import { Bell, CircleDollarSign, Radio, Users, ChevronRight } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { useI18n } from "../../i18n/locale";
import type { FloorFilter } from "./floor-model";

export function TableMetrics({
  tables,
  vacantCount,
  pending = false,
  filter = "all",
  onFilterChange,
}: {
  pending?: boolean;
  tables: TableState[];
  vacantCount: number;
  filter?: FloorFilter;
  onFilterChange?: (filter: FloorFilter) => void;
}) {
  const { t } = useI18n();
  const metrics = [
    {
      filter: "active",
      label: t("admin_active"),
      value: tables.filter((table) => table.status === "open").length,
      total: tables.length + vacantCount,
      icon: Users,
    },
    {
      filter: "called",
      label: t("floor_filter_called"),
      value: tables.filter((table) => table.staffCalled).length,
      icon: Bell,
    },
    {
      filter: "billing",
      label: t("admin_billing"),
      value: tables.filter((table) => table.billRequested && table.bill.due > 0).length,
      icon: CircleDollarSign,
    },
    {
      filter: "voice",
      label: t("admin_voice_errors"),
      value: tables.filter((table) => table.voiceState === "error").length,
      icon: Radio,
    },
  ] as const;
  return (
    <div className="grid grid-cols-4 gap-1 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
      {metrics.map(({ label, value, icon: Icon, filter: target, ...metric }) => {
        const tone =
          target === "active"
            ? "bg-info-soft text-info"
            : value > 0
              ? target === "voice"
                ? "bg-destructive/10 text-destructive"
                : "bg-warning-soft text-warning"
              : "bg-secondary text-muted-foreground";
        const content = (
          <>
            <span
              className={`col-start-1 row-start-1 flex size-5 shrink-0 items-center justify-center rounded-full sm:size-8 ${tone}`}
            >
              <Icon className="size-3.5 sm:size-4" aria-hidden="true" />
            </span>
            <span className="col-span-2 col-start-1 row-start-2 min-w-0 text-center text-[0.6875rem] leading-tight break-keep sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:text-left sm:text-sm">
              {label}
            </span>
            <span className="col-start-2 row-start-1 flex min-w-0 items-center justify-between gap-1 sm:col-span-2 sm:col-start-1 sm:row-start-2 sm:gap-2">
              <strong className="text-base font-semibold whitespace-nowrap tabular-nums sm:text-2xl">
                {pending ? <Skeleton className="size-6 sm:h-8 sm:w-12" /> : value}
                {!pending && "total" in metric && (
                  <small className="ml-0.5 text-xs font-normal text-muted-foreground sm:ml-1 sm:text-sm">
                    / {metric.total}
                  </small>
                )}
              </strong>
              {onFilterChange && !pending && (
                <ChevronRight
                  aria-hidden="true"
                  className="hidden size-4 shrink-0 text-muted-foreground sm:block"
                />
              )}
            </span>
          </>
        );
        return onFilterChange && !pending ? (
          <Button
            key={target}
            variant="outline"
            aria-pressed={filter === target}
            onClick={() => onFilterChange(target)}
            className="grid min-h-18 grid-cols-[auto_minmax(0,1fr)] gap-1 px-1 py-2 text-left sm:min-h-28 sm:gap-2 sm:p-3 aria-pressed:border-control-edge-hover aria-pressed:bg-control-selected"
          >
            {content}
          </Button>
        ) : (
          <div
            key={target}
            className="grid min-h-18 grid-cols-[auto_minmax(0,1fr)] items-center gap-1 border-b border-border px-1 py-2 sm:min-h-28 sm:gap-2 sm:p-3"
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}
