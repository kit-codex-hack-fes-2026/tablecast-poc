import type { TableState } from "@tablecast/api/schema";
import { Bell, ChevronRight, CircleDollarSign, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DataTable, type DataTableColumn } from "../../components/data-table";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { money } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import type { FloorFilter } from "./floor-model";

type FloorRow = { id: string; name: string; visit: TableState | null };
export function TableTimeline({
  tables,
  vacantTables = [],
  onSelect,
  onOpen,
  initialNow,
  pending = false,
  filter = "all",
}: {
  pending?: boolean;
  tables: TableState[];
  initialNow?: number;
  vacantTables?: { id: string; name: string }[];
  onSelect: (id: string) => void;
  onOpen?: (table: { id: string; name: string }) => void;
  filter?: FloorFilter;
}) {
  const { locale, t } = useI18n();
  const [now, setNow] = useState(() => initialNow ?? Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  // 更新のたびに操作中の卓を動かさず、初回の要対応順を保つ。
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
  const filtered = rows.filter(({ visit }) => {
    if (filter === "all") return true;
    if (filter === "vacant") return !visit;
    if (!visit) return false;
    if (filter === "attention") return priority(visit) < 3;
    if (filter === "active") return visit.status === "open";
    if (filter === "called") return visit.staffCalled;
    if (filter === "billing") return visit.billRequested && visit.bill.due > 0;
    return visit.voiceState === "error";
  });
  const columns = useMemo(
    () => tableTimelineColumns(t, locale, now, onSelect, onOpen),
    [t, locale, now, onSelect, onOpen],
  );
  return (
    <DataTable
      pending={pending}
      data={filtered}
      columns={columns}
      getRowId={(row) => row.id}
      searchLabel={t("device_search_table")}
      empty={t(filter === "all" ? "admin_no_tables" : "floor_filter_empty")}
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
): DataTableColumn<FloorRow>[] {
  return [
    {
      accessorKey: "name",
      header: t("admin_table"),
      cell: ({ row }) => (
        <Button
          className="h-auto min-h-12 min-w-24 justify-start px-0 text-left"
          variant="ghost"
          onClick={() =>
            row.original.visit
              ? onSelect(row.original.id)
              : onOpen?.({ id: row.original.id, name: row.original.name })
          }
        >
          <span>
            <strong className="block text-base">{row.original.name}</strong>
            <span className="block text-sm font-normal text-muted-foreground">
              {row.original.visit
                ? `${row.original.visit.guestCount} ${t("admin_guests")}`
                : t("admin_open_table")}
            </span>
          </span>
          <ChevronRight className="size-4" />
        </Button>
      ),
    },
    {
      id: "status",
      header: t("common_status"),
      cell: ({ row }) => (
        <div className="min-w-24 space-y-2">
          <Badge variant={row.original.visit ? "success" : "inactive"}>
            {t(row.original.visit ? "admin_open" : "admin_vacant")}
          </Badge>
          {row.original.visit && (
            <div className="space-y-1 text-sm text-muted-foreground">
              <p className="tabular-nums">
                {Math.max(0, Math.floor((now - row.original.visit.openedAt) / 60_000))}{" "}
                {t("kiosk_minutes")}
              </p>
              <p>
                {t(
                  row.original.visit.locale === "ja"
                    ? "common_language_native_ja"
                    : "common_language_native_en",
                )}
              </p>
            </div>
          )}
        </div>
      ),
    },
    {
      id: "attention",
      header: t("floor_attention"),
      cell: ({ row }) => {
        const visit = row.original.visit;
        return visit && priority(visit) < 3 ? (
          <div className="flex min-w-32 flex-col items-start gap-2">
            {visit.staffCalled && (
              <Badge variant="outline">
                <Bell className="size-4" />
                {t("floor_filter_called")}
              </Badge>
            )}
            {visit.billRequested && visit.bill.due > 0 && (
              <Badge variant="outline">
                <CircleDollarSign className="size-4" />
                {t("admin_billing")}
              </Badge>
            )}
            {visit.voiceState === "error" && (
              <Badge variant="destructive">
                <TriangleAlert className="size-4" />
                {t("admin_voice_errors")}
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        );
      },
    },
    {
      id: "billing",
      header: t("floor_orders_billing"),
      cell: ({ row }) =>
        row.original.visit ? (
          <dl className="min-w-36 space-y-1 text-sm tabular-nums">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t("admin_ordered")}</dt>
              <dd>{money(row.original.visit.bill.orderedTotal, locale)}</dd>
            </div>
            <div className="flex justify-between gap-4 font-semibold">
              <dt>{t("admin_due")}</dt>
              <dd>{money(row.original.visit.bill.due, locale)}</dd>
            </div>
            {row.original.visit.cart.total > 0 && (
              <div className="flex justify-between gap-4 text-muted-foreground">
                <dt>{t("admin_cart")}</dt>
                <dd>{money(row.original.visit.cart.total, locale)}</dd>
              </div>
            )}
          </dl>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];
}
