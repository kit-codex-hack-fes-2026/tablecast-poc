import { type ClosedSessionSummary } from "@tablecast/api/schema";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  Banknote,
  CalendarCheck,
  CalendarDays,
  Clock3,
  Table2,
  Users,
} from "lucide-react";
import { useMemo } from "react";
import { DataTable } from "../../components/data-table";
import { type DataTableColumn } from "../../components/data-table-model";
import { DateTime } from "../../components/date-time";
import { ErrorNotice } from "../../components/error-notice";
import { Button } from "../../components/ui/button";
import { money } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { useCollectionSearch } from "../shell/collection-search";
import { historyOptions } from "./history-query";

export function VisitHistory({
  storeId,
  onSelect,
}: {
  onSelect: (sessionId: string) => void;
  storeId: string;
}) {
  const { t } = useI18n();
  const history = useInfiniteQuery(historyOptions(storeId));
  const collection = useCollectionSearch({
    sortIds: ["tableName", "openedAt", "closedAt", "guestCount", "duration", "total"],
  });
  return (
    <section>
      <ErrorNotice
        error={history.error}
        onRetry={() => {
          void history.refetch();
        }}
      />
      {(history.isPending || history.data) && (
        <VisitHistoryTable
          sessions={history.data?.pages.flatMap((page) => page.sessions) ?? []}
          onSelect={onSelect}
          pending={history.isPending}
          collection={collection}
        />
      )}
      <p className="mt-2 text-xs text-muted-foreground">{t("collection_loaded_scope")}</p>
      {history.hasNextPage && (
        <Button
          className="mt-5"
          variant="outline"
          type="button"
          disabled={history.isFetching}
          onClick={() => {
            void history.fetchNextPage();
          }}
        >
          <ArrowDown aria-hidden="true" />
          {history.isFetchingNextPage ? t("common_loading") : t("admin_more_visits")}
        </Button>
      )}
    </section>
  );
}

export function VisitHistoryTable({
  sessions,
  onSelect,
  pending = false,
  collection,
}: {
  collection?: ReturnType<typeof useCollectionSearch>;
  onSelect: (sessionId: string) => void;
  pending?: boolean;
  sessions: ClosedSessionSummary[];
}) {
  const { t, locale } = useI18n();
  const columns = useMemo(
    () => visitHistoryTableColumns(t, locale, onSelect),
    [t, locale, onSelect],
  );
  return (
    <DataTable
      {...collection}
      tableLabel={t("admin_history")}
      searchLabel={t("collection_search_visits")}
      searchPlaceholder={t("collection_search_tables_placeholder")}
      data={sessions}
      pending={pending}
      columns={columns}
      getRowId={(row) => row.id}
      empty={t("admin_history_empty")}
      pagination={false}
    />
  );
}

function visitHistoryTableColumns(
  t: ReturnType<typeof useI18n>["t"],
  locale: ReturnType<typeof useI18n>["locale"],
  onSelect: (id: string) => void,
): DataTableColumn<ClosedSessionSummary>[] {
  return [
    {
      accessorKey: "tableName",
      header: t("collection_table_name"),
      meta: { icon: Table2, rowHeader: true },
      cell: ({ row }) => (
        <div className="min-w-24">
          <Button
            variant="link"
            className="h-auto min-h-11 justify-start px-0 text-left whitespace-normal underline decoration-border underline-offset-4 hover:decoration-current"
            onClick={() => onSelect(row.original.id)}
          >
            <Table2 aria-hidden="true" className="size-4 shrink-0" />
            {row.original.tableName}
          </Button>
        </div>
      ),
    },
    {
      accessorKey: "openedAt",
      enableGlobalFilter: false,
      meta: { icon: CalendarDays },
      header: t("admin_visit_started"),
      cell: ({ row }) => <DateTime value={row.original.openedAt} />,
    },
    {
      accessorKey: "closedAt",
      enableGlobalFilter: false,
      meta: { icon: CalendarCheck },
      header: t("admin_visit_closed"),
      cell: ({ row }) => <DateTime value={row.original.closedAt} />,
    },
    {
      accessorKey: "guestCount",
      header: t("floor_sort_guests"),
      meta: { icon: Users, align: "right" },
      enableGlobalFilter: false,
      cell: ({ row }) => `${row.original.guestCount.toLocaleString(locale)} ${t("admin_guests")}`,
    },
    {
      id: "duration",
      accessorFn: (row) => Math.max(0, row.closedAt - row.openedAt),
      header: t("floor_sort_duration"),
      meta: { icon: Clock3, align: "right" },
      enableGlobalFilter: false,
      cell: ({ row }) =>
        `${Math.ceil(Math.max(0, row.original.closedAt - row.original.openedAt) / 60000).toLocaleString(locale)} ${t("kiosk_minutes")}`,
    },
    {
      id: "total",
      accessorFn: (row) => row.bill.orderedTotal + row.bill.planTotal + row.bill.adjustmentTotal,
      enableGlobalFilter: false,
      meta: { align: "right", icon: Banknote },
      header: t("admin_visit_total"),
      cell: ({ row }) => (
        <span className="whitespace-nowrap tabular-nums">
          {money(
            row.original.bill.orderedTotal +
              row.original.bill.planTotal +
              row.original.bill.adjustmentTotal,
            locale,
          )}
        </span>
      ),
    },
  ];
}
