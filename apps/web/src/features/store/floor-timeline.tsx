import type { TableState } from "@tablecast/api/schema";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useElementScrollRestoration } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  LocateFixed,
  ZoomIn,
  ZoomOut,
  ScanLine,
  RotateCw,
  ListPlus,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { Button } from "../../components/ui/button";
import { DatePicker } from "../../components/date-picker";
import { dateTime } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { CollectionSort } from "../../components/collection-sort";
import { storeDate, moveDate, type FloorSort, type FloorZoom } from "./floor-model";
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
  search = "",
  sort,
  zoom = "normal",
  onZoomChange,
}: {
  storeId: string;
  date: string;
  initialNow: number;
  tables: TableState[];
  vacantTables: { id: string; name: string }[];
  onDateChange: (date: string) => void;
  onSelect: (id: string) => void;
  onOpen: (table: { id: string; name: string }) => void;
  search?: string;
  sort?: FloorSort;
  zoom?: FloorZoom;
  onZoomChange?: (zoom: FloorZoom) => void;
}) {
  const { t, locale } = useI18n();
  const client = useQueryClient();
  const query = useInfiniteQuery(timelineOptions(storeId, date));
  const [now, setNow] = useState(initialNow);
  const [scrollRequest, setScrollRequest] = useState(0);
  const restorationId = `tablecast-floor-${storeId}-${date}-${zoom}`;
  const restoration = useElementScrollRestoration({
    id: restorationId,
    getKey: (location) => `${location.pathname}?date=${date}&zoom=${zoom}`,
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
      <div className="flex flex-wrap items-end gap-2">
        <Button
          variant="outline"
          aria-label={t("floor_previous")}
          onClick={() => onDateChange(moveDate(date, -1))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="order-first w-full sm:order-0 sm:w-auto">
          <DatePicker
            label={t("floor_date")}
            className="sm:w-72"
            value={date}
            required
            onValueChange={(next) => {
              if (next) onDateChange(next);
            }}
          />
        </div>
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
        <div className="ml-auto grid min-w-48 gap-1">
          <span className="flex items-center gap-2 text-sm font-medium">
            <ZoomIn aria-hidden className="size-4" />
            {t("floor_zoom")}
          </span>
          <CollectionSort
            label={t("floor_zoom")}
            value={zoom}
            options={[
              { value: "compact", label: t("floor_zoom_compact"), icon: ZoomOut },
              { value: "normal", label: t("floor_zoom_normal"), icon: ScanLine },
              { value: "detailed", label: t("floor_zoom_detailed"), icon: ZoomIn },
            ]}
            onValueChange={(next) => {
              if (next === "compact" || next === "normal" || next === "detailed")
                onZoomChange?.(next);
            }}
            disabled={!onZoomChange}
          />
        </div>
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
      {inconsistent ? (
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
            <RotateCw aria-hidden />
            {t("common_retry")}
          </Button>
        </div>
      ) : (
        (first || query.isPending) && (
          <>
            {query.hasNextPage && (
              <p role="status" className="rounded-lg bg-accent-soft p-3 text-sm">
                {t("floor_partial")}
              </p>
            )}
            <TableCalendar
              key={date}
              page={first}
              date={date}
              sessions={sessions}
              tables={tables}
              vacantTables={vacantTables}
              now={now}
              search={search}
              sort={sort}
              zoom={zoom}
              partial={query.hasNextPage}
              scrollRequest={scrollRequest}
              restorationId={restorationId}
              initialScrollLeft={restoration?.scrollX}
              onSelect={onSelect}
              onOpen={onOpen}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                {first ? `${t("floor_updated")}: ${dateTime(first.observedAt, locale)}` : "\u00a0"}
                {query.isFetching && ` · ${t("floor_updating")}`}
              </span>
              {query.hasNextPage && (
                <Button
                  variant="outline"
                  disabled={query.isFetching}
                  onClick={() => void query.fetchNextPage()}
                >
                  <ListPlus aria-hidden />
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
