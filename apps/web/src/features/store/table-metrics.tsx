import type { TableState } from "@tablecast/api/schema";
import { Bell, CircleDollarSign, Radio, Users } from "lucide-react";
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
      {metrics.map(({ label, value, icon: Icon, filter: target, ...metric }) => (
        <Button
          key={target}
          variant="outline"
          disabled={pending || !onFilterChange}
          aria-pressed={filter === target}
          onClick={() => onFilterChange?.(target)}
          className="h-auto min-h-16 items-center justify-between gap-3 rounded-xl p-3 text-left aria-pressed:border-primary aria-pressed:bg-secondary disabled:opacity-100"
        >
          <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            {label}
            <Icon className="size-4 shrink-0" aria-hidden="true" />
          </span>
          <strong className="shrink-0 text-2xl font-semibold tabular-nums">
            {pending ? <Skeleton className="h-8 w-16" /> : value}
            {!pending && "total" in metric && (
              <small className="ml-2 text-sm font-normal text-muted-foreground">
                / {metric.total}
              </small>
            )}
          </strong>
        </Button>
      ))}
    </div>
  );
}
