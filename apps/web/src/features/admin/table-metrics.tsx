import type { TableState } from "@tablecast/api/schema";
import { Bell, CircleDollarSign, Radio, Users } from "lucide-react";
import { useI18n } from "../../i18n/locale";

export function TableMetrics({
  tables,
  vacantCount,
}: {
  tables: TableState[];
  vacantCount: number;
}) {
  const { t } = useI18n();
  const metrics = [
    {
      label: t("admin_active"),
      value: tables.filter((table) => table.status === "open").length,
      total: tables.length + vacantCount,
      icon: Users,
      attention: false,
    },
    {
      label: t("admin_attention"),
      value: tables.filter((table) => table.staffCalled).length,
      icon: Bell,
      attention: true,
    },
    {
      label: t("admin_billing"),
      value: tables.filter((table) => table.billRequested && table.bill.due > 0).length,
      icon: CircleDollarSign,
      attention: false,
    },
    {
      label: t("admin_voice_errors"),
      value: tables.filter((table) => table.voiceState === "error").length,
      icon: Radio,
      attention: false,
    },
  ];
  return (
    <div className="mb-8 grid grid-cols-4 gap-4 max-lg:grid-cols-2">
      {metrics.map(({ label, value, total, icon: Icon, attention }) => (
        <div
          key={label}
          data-slot="metric"
          data-attention={attention || undefined}
          className="group flex flex-col gap-3 rounded-lg border border-border bg-card p-4 data-attention:border-accent/30 data-attention:bg-accent-soft"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="text-xs text-muted-foreground">{label}</span>
            <Icon
              className="size-5 shrink-0 text-muted-foreground group-data-attention:text-accent-foreground"
              aria-hidden="true"
            />
          </div>
          <strong className="text-3xl font-medium tracking-tight group-data-attention:text-accent-foreground">
            {value}
            {total !== undefined && (
              <small className="ml-2 text-base text-muted-foreground">/ {total}</small>
            )}
          </strong>
        </div>
      ))}
    </div>
  );
}
