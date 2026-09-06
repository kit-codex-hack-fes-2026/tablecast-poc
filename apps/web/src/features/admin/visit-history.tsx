import {
  historyPageSchema,
  type ClosedSessionSummary,
  type HistoryPage,
} from "@tablecast/api/schema";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { ErrorNotice } from "../../components/error-notice";
import { Button } from "../../components/ui/button";
import { Table, TableCell, TableHead } from "../../components/ui/table";
import { money, useI18n } from "../../i18n/locale";
import { api } from "../../lib/api";

export function VisitHistory({
  storeId,
  onSelect,
}: {
  storeId: string;
  onSelect: (sessionId: string) => void;
}) {
  const { t } = useI18n();
  const history = useInfiniteQuery({
    queryKey: ["tablecast-visit-history", storeId],
    queryFn: ({ pageParam, signal }) => {
      const query = new URLSearchParams({ limit: "30" });
      if (pageParam) {
        query.set("beforeClosedAt", String(pageParam.closedAt));
        query.set("beforeId", pageParam.id);
      }
      return api(`/api/admin/stores/${storeId}/history?${query}`, { signal }, historyPageSchema);
    },
    initialPageParam: null as HistoryPage["nextCursor"],
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
  return (
    <section>
      <ErrorNotice
        error={history.error}
        onRetry={() => {
          void history.refetch();
        }}
      />
      {history.isPending ? (
        <p>{t("common_loading")}</p>
      ) : (
        <VisitHistoryTable
          sessions={history.data?.pages.flatMap((page) => page.sessions) ?? []}
          onSelect={onSelect}
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
}: {
  sessions: ClosedSessionSummary[];
  onSelect: (sessionId: string) => void;
}) {
  const { t, locale } = useI18n();
  const date = new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-GB", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  });
  if (!sessions.length)
    return (
      <p className="py-12 px-6 text-muted-foreground text-center">{t("admin_history_empty")}</p>
    );
  return (
    <section
      className="overflow-x-auto rounded-xl border border-border bg-card"
      aria-label={t("admin_history")}
    >
      <Table className="w-full min-w-176 text-left text-sm">
        <thead className="border-b border-border text-muted-foreground">
          <tr>
            <TableHead scope="col" className="px-4 py-4 font-medium">
              {t("admin_table")}
            </TableHead>
            <TableHead scope="col" className="px-4 py-4 font-medium">
              {t("admin_visit_started")}
            </TableHead>
            <TableHead scope="col" className="px-4 py-4 font-medium">
              {t("admin_visit_closed")}
            </TableHead>
            <TableHead scope="col" className="px-4 py-4 font-medium">
              {t("admin_visit_total")}
            </TableHead>
            <TableHead scope="col" className="px-4 py-4 font-medium">
              <span className="sr-only">{t("admin_details")}</span>
            </TableHead>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr
              key={session.id}
              data-session-id={session.id}
              className="border-b border-border last:border-0"
            >
              <TableHead scope="row" className="px-4 py-3 text-left font-medium">
                {session.tableName}
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  {session.guestCount} {t("admin_guests")}
                </span>
              </TableHead>
              <TableCell className="px-4 py-3">
                <time dateTime={new Date(session.openedAt).toISOString()}>
                  {date.format(session.openedAt)}
                </time>
              </TableCell>
              <TableCell className="px-4 py-3">
                <time dateTime={new Date(session.closedAt).toISOString()}>
                  {date.format(session.closedAt)}
                </time>
              </TableCell>
              <TableCell className="px-4 py-3 font-medium tabular-nums">
                {money(
                  session.bill.orderedTotal + session.bill.planTotal + session.bill.adjustmentTotal,
                  locale,
                )}
              </TableCell>
              <TableCell className="px-4 py-3">
                <Button variant="ghost" type="button" onClick={() => onSelect(session.id)}>
                  {t("admin_details")}
                  <ArrowUpRight size={16} aria-hidden="true" />
                </Button>
              </TableCell>
            </tr>
          ))}
        </tbody>
      </Table>
    </section>
  );
}
