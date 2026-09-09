import { tv } from "tailwind-variants";
import type { TableState } from "@tablecast/api/schema";
import type { ColumnDef } from "@tanstack/react-table";
import { Bell, ChevronRight, CirclePause, Mic, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DataTable } from "../../components/data-table";
import { DateTime } from "../../components/date-time";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { money } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { EventLabel } from "./events";

const voiceStatus = tv({
  base: "flex items-center gap-2 whitespace-nowrap text-sm",
  variants: { error: { true: "text-destructive", false: "text-muted-foreground" } },
});

type FloorRow = { id: string; name: string; visit: TableState | null };
export function TableTimeline({
  tables,
  vacantTables = [],
  onSelect,
  onOpen,
}: {
  tables: TableState[];
  vacantTables?: { id: string; name: string }[];
  onSelect: (id: string) => void;
  onOpen?: (table: { id: string; name: string }) => void;
}) {
  const { locale, t } = useI18n();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const [initialOrder] = useState(
    () =>
      new Map(
        [...tables]
          .toSorted((a, b) => priority(a) - priority(b) || a.tableName.localeCompare(b.tableName))
          .map((item, index) => [item.id, index]),
      ),
  );
  const rows: FloorRow[] = [
    ...[...tables]
      .toSorted(
        (a, b) =>
          (initialOrder.get(a.id) ?? Infinity) - (initialOrder.get(b.id) ?? Infinity) ||
          a.tableName.localeCompare(b.tableName),
      )
      .map((visit) => ({ id: visit.id, name: visit.tableName, visit })),
    ...vacantTables.map((item) => ({ ...item, visit: null })),
  ];
  const columns = useMemo(
    () => tableTimelineColumns(t, locale, now, onSelect, onOpen),
    [t, locale, now, onSelect, onOpen],
  );
  return (
    <DataTable
      data={rows}
      columns={columns}
      getRowId={(row) => row.id}
      searchLabel={t("device_search_table")}
      empty={t("admin_no_tables")}
      pagination={false}
    />
  );
}
function priority(table: TableState) {
  if (table.staffCalled) return 0;
  if (table.billRequested && table.bill.due > 0) return 1;
  if (table.voiceState === "error") return 2;
  return 3;
}

function tableTimelineColumns(
  t: ReturnType<typeof useI18n>["t"],
  locale: ReturnType<typeof useI18n>["locale"],
  now: number,
  onSelect: (id: string) => void,
  onOpen: ((table: { id: string; name: string }) => void) | undefined,
): ColumnDef<FloorRow>[] {
  return [
    {
      accessorKey: "name",
      header: t("admin_table"),
      cell: ({ row }) => (
        <Button
          className="h-auto min-h-12 justify-start px-0 text-left"
          variant="ghost"
          onClick={() =>
            row.original.visit
              ? onSelect(row.original.id)
              : onOpen?.({ id: row.original.id, name: row.original.name })
          }
        >
          <div>
            <strong className="block text-base">{row.original.name}</strong>
            <span className="block text-sm text-muted-foreground">
              {row.original.visit
                ? `${row.original.visit.guestCount} ${t("admin_guests")}`
                : t("admin_open_table")}
            </span>
          </div>
          <ChevronRight className="size-4" />
        </Button>
      ),
    },
    {
      id: "elapsed",
      header: t("admin_elapsed"),
      cell: ({ row }) => (
        <span className="whitespace-nowrap tabular-nums">
          {row.original.visit
            ? `${Math.max(0, Math.floor((now - row.original.visit.openedAt) / 60_000))} ${t("kiosk_minutes")}`
            : "—"}
        </span>
      ),
    },
    {
      id: "status",
      header: t("common_status"),
      cell: ({ row }) => (
        <Badge variant={row.original.visit ? "success" : "inactive"}>
          {t(row.original.visit ? "admin_open" : "admin_vacant")}
        </Badge>
      ),
    },
    {
      id: "voice",
      header: t("admin_voice"),
      cell: ({ row }) => {
        const status = row.original.visit?.voiceState;
        return status ? (
          <span className={voiceStatus({ error: status === "error" })}>
            {status === "active" ? (
              <Mic className="size-4" />
            ) : status === "error" ? (
              <TriangleAlert className="size-4" />
            ) : (
              <CirclePause className="size-4" />
            )}
            {t(
              status === "active"
                ? "admin_active_voice"
                : status === "error"
                  ? "admin_error_voice"
                  : "admin_stopped",
            )}
          </span>
        ) : (
          "—"
        );
      },
    },
    {
      id: "locale",
      header: t("admin_locale"),
      cell: ({ row }) =>
        row.original.visit ? (row.original.visit.locale === "ja" ? "日本語" : "English") : "—",
    },
    {
      id: "cart",
      header: t("admin_cart"),
      cell: ({ row }) => money(row.original.visit?.cart.total ?? 0, locale),
    },
    {
      id: "ordered",
      header: t("admin_ordered"),
      cell: ({ row }) => money(row.original.visit?.bill.orderedTotal ?? 0, locale),
    },
    {
      id: "due",
      header: t("admin_due"),
      cell: ({ row }) => (
        <strong className="whitespace-nowrap tabular-nums">
          {money(row.original.visit?.bill.due ?? 0, locale)}
        </strong>
      ),
    },
    {
      id: "attention",
      header: t("admin_attention"),
      cell: ({ row }) =>
        row.original.visit?.staffCalled ? (
          <Badge className="bg-accent-soft text-accent-foreground">
            <Bell className="size-4" />
            {t("admin_attention")}
          </Badge>
        ) : (
          "—"
        ),
    },
    {
      id: "latest",
      header: t("admin_updated"),
      cell: ({ row }) => {
        const event = row.original.visit?.events.at(-1);
        return event ? (
          <div className="min-w-40 space-y-1 text-sm">
            <EventLabel event={event} />
            <div>
              <DateTime value={event.createdAt} />
            </div>
          </div>
        ) : (
          "—"
        );
      },
    },
  ];
}
