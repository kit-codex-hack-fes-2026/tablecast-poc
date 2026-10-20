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
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
              className={`flex size-10 shrink-0 items-center justify-center rounded-full ${tone}`}
            >
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 text-sm">{label}</span>
            <strong className="shrink-0 text-2xl font-semibold tabular-nums">
              {pending ? <Skeleton className="h-8 w-12" /> : value}
              {!pending && "total" in metric && (
                <small className="ml-1 text-sm font-normal text-muted-foreground">
                  / {metric.total}
                </small>
              )}
            </strong>
          </>
        );
        return onFilterChange && !pending ? (
          <Button
            key={target}
            variant="outline"
            aria-pressed={filter === target}
            onClick={() => onFilterChange(target)}
            className="min-h-20 justify-start gap-3 p-3 text-left aria-pressed:border-info aria-pressed:bg-info-soft"
          >
            {content}
            <ChevronRight aria-hidden="true" className="size-4 text-info" />
          </Button>
        ) : (
          <div key={target} className="flex min-h-20 items-center gap-3 border-b border-border p-3">
            {content}
          </div>
        );
      })}
    </div>
  );
}
