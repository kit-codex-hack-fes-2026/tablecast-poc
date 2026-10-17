import type { TableState } from "@tablecast/api/schema";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useElementScrollRestoration } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, LocateFixed } from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { dateTime } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { storeDate, moveDate } from "./floor-model";
import { TableCalendar } from "./table-calendar";
import { timelineOptions } from "./timeline-query";

export function FloorTimeline({
  storeId,
  date,
  initialNow,
  tables,
  vacantTables,
  onDateChange,
  onSelect,
  onOpen,
}: {
  storeId: string;
  date: string;
  initialNow: number;
  tables: TableState[];
  vacantTables: { id: string; name: string }[];
  onDateChange: (date: string) => void;
  onSelect: (id: string) => void;
  onOpen: (table: { id: string; name: string }) => void;
}) {
  const { t, locale } = useI18n();
  const client = useQueryClient();
  const query = useInfiniteQuery(timelineOptions(storeId, date));
  const [now, setNow] = useState(initialNow);
  const [scrollRequest, setScrollRequest] = useState(0);
  const restorationId = `tablecast-floor-${storeId}-${date}`;
  const restoration = useElementScrollRestoration({
    id: restorationId,
    getKey: (location) => `${location.pathname}?date=${date}`,
  });
  useEffect(() => {
    const update = () => {
      if (!document.hidden) setNow(Date.now());
    };
    const interval = setInterval(update, 60_000);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const first = query.data?.pages[0];
  const sessions = [
    ...new Map(
      query.data?.pages.flatMap((page) =>
        page.sessions.map((session) => [session.id, session] as const),
      ),
    ).values(),
  ];
  const tableIds = new Set([
    ...tables.map((table) => table.tableId),
    ...vacantTables.map((table) => table.id),
  ]);
  const inconsistent = sessions.some((session) => !tableIds.has(session.tableId));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          aria-label={t("floor_previous")}
          onClick={() => onDateChange(moveDate(date, -1))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Input
          type="date"
          className="w-44"
          aria-label={t("floor_date")}
          value={date}
          onChange={(event) => {
            if (event.target.validity.valid && event.target.value) onDateChange(event.target.value);
          }}
        />
        <Button
          variant="outline"
          aria-label={t("floor_next")}
          onClick={() => onDateChange(moveDate(date, 1))}
        >
          <ChevronRight className="size-4" />
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const current = Date.now();
            setNow(current);
            onDateChange(storeDate(current));
            setScrollRequest((value) => value + 1);
          }}
        >
          <LocateFixed className="size-4" />
          {t("floor_now")}
        </Button>
      </div>
      {storeDate(initialNow) !== storeDate(now) && date !== storeDate(now) && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("floor_day_changed")}
        </p>
      )}
      <ErrorNotice
        error={query.error}
        retrying={query.isFetching}
        onRetry={() => {
          void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch());
        }}
      />
      {query.isPending ? (
        <LoadingState />
      ) : inconsistent ? (
        <div role="alert" className="space-y-2">
          <p>{t("floor_inconsistent")}</p>
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => {
              void client.invalidateQueries({ queryKey: ["tablecast-admin", storeId] });
              void query.refetch();
            }}
          >
            {t("common_retry")}
          </Button>
        </div>
      ) : (
        first && (
          <>
            {query.hasNextPage && (
              <p role="status" className="rounded-lg bg-accent-soft p-3 text-sm">
                {t("floor_partial")}
              </p>
            )}
            <TableCalendar
              key={date}
              page={first}
              sessions={sessions}
              tables={tables}
              vacantTables={vacantTables}
              now={now}
              partial={query.hasNextPage}
              scrollRequest={scrollRequest}
              restorationId={restorationId}
              initialScrollLeft={restoration?.scrollX}
              onSelect={onSelect}
              onOpen={onOpen}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                {t("floor_updated")}: {dateTime(first.observedAt, locale)}
                {query.isFetching && ` · ${t("floor_updating")}`}
              </span>
              {query.hasNextPage && (
                <Button
                  variant="outline"
                  disabled={query.isFetching}
                  onClick={() => void query.fetchNextPage()}
                >
                  {t(query.isFetchingNextPage ? "common_loading" : "floor_more")}
                </Button>
              )}
            </div>
          </>
        )
      )}
    </div>
  );
}
