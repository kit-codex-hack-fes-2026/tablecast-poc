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
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
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
              className={`flex size-6 shrink-0 items-center justify-center rounded-full sm:size-8 ${tone}`}
            >
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 text-sm break-keep">{label}</span>
            <span className="col-span-2 flex items-center justify-between gap-2">
              <strong className="text-xl font-semibold tabular-nums sm:text-2xl">
                {pending ? <Skeleton className="h-8 w-12" /> : value}
                {!pending && "total" in metric && (
                  <small className="ml-1 text-sm font-normal text-muted-foreground">
                    / {metric.total}
                  </small>
                )}
              </strong>
              {onFilterChange && !pending && (
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
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
            className="grid min-h-22 grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 p-2 text-left sm:min-h-28 sm:gap-2 sm:p-3 aria-pressed:border-control-edge-hover aria-pressed:bg-control-selected"
          >
            {content}
          </Button>
        ) : (
          <div
            key={target}
            className="grid min-h-22 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 border-b border-border p-2 sm:min-h-28 sm:gap-2 sm:p-3"
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}
