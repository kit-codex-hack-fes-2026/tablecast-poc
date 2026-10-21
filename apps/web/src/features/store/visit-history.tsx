import { type ClosedSessionSummary } from "@tablecast/api/schema";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { DataTable, type DataTableColumn } from "../../components/data-table";
import { DateTime } from "../../components/date-time";
import { ErrorNotice } from "../../components/error-notice";
import { Button } from "../../components/ui/button";
import { money } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { historyOptions } from "./history-query";

export function VisitHistory({
  storeId,
  onSelect,
}: {
  storeId: string;
  onSelect: (sessionId: string) => void;
}) {
  const { t } = useI18n();
  const history = useInfiniteQuery(historyOptions(storeId));
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
        />
      )}
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
}: {
  pending?: boolean;
  sessions: ClosedSessionSummary[];
  onSelect: (sessionId: string) => void;
}) {
  const { t, locale } = useI18n();
  const columns = useMemo(
    () => visitHistoryTableColumns(t, locale, onSelect),
    [t, locale, onSelect],
  );
  return (
    <DataTable
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
      header: t("admin_table"),
      cell: ({ row }) => (
        <div className="min-w-24">
          <Button
            variant="link"
            className="h-auto min-h-11 justify-start px-0 text-left whitespace-normal underline decoration-border underline-offset-4 hover:decoration-current"
            onClick={() => onSelect(row.original.id)}
          >
            {row.original.tableName}
          </Button>
          <span className="block text-sm font-normal text-muted-foreground">
            {row.original.guestCount} {t("admin_guests")}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "openedAt",
      header: t("admin_visit_started"),
      cell: ({ row }) => <DateTime value={row.original.openedAt} />,
    },
    {
      accessorKey: "closedAt",
      header: t("admin_visit_closed"),
      cell: ({ row }) => <DateTime value={row.original.closedAt} />,
    },
    {
      id: "total",
      meta: { align: "right" },
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
