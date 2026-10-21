import type { TableState, TimelinePage, TimelineSession } from "@tablecast/api/schema";
import { Plus } from "lucide-react";
import { type Ref, useImperativeHandle, useMemo } from "react";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { time } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import {
  compareFloorRows,
  floorPriority,
  type FloorSort,
  floorTrackWidth,
  type FloorZoom,
  storeDate,
} from "./floor-model";
import { VisitBand } from "./table-calendar-band";
import { VisitList } from "./table-calendar-preview";
import { useTimelineViewport } from "./table-calendar-viewport";

const hours = Array.from({ length: 25 }, (_, hour) => hour);

export type TableCalendarHandle = {
  zoom: (zoom: FloorZoom, options?: { replace?: boolean }) => void;
};

export function TableCalendar({
  ref,
  page,
  date,
  sessions,
  tables,
  vacantTables,
  now,
  partial = false,
  scrollRequest = 0,
  initialScrollLeft,
  restorationId,
  onSelect,
  onOpen,
  search = "",
  sort,
  zoom = 100,
  onZoomChange,
}: {
  date?: string;
  initialScrollLeft?: number;
  now: number;
  onOpen: (table: { id: string; name: string }) => void;
  onSelect: (id: string) => void;
  onZoomChange?: (zoom: FloorZoom, options?: { replace?: boolean }) => void;
  page?: Pick<TimelinePage, "date" | "endAt" | "startAt">;
  partial?: boolean;
  ref?: Ref<TableCalendarHandle>;
  restorationId?: string;
  scrollRequest?: number;
  search?: string;
  sessions: TimelineSession[];
  sort?: FloorSort;
  tables: TableState[];
  vacantTables: { id: string; name: string }[];
  zoom?: FloorZoom;
}) {
  const { t, locale } = useI18n();
  const trackWidth = floorTrackWidth(zoom);
  const today = (page?.date ?? date) === storeDate(now);
  const active = new Map(tables.map((table) => [table.id, table]));
  const currentTables = new Map(tables.map((table) => [table.tableId, table]));
  const vacant = new Set(vacantTables.map((table) => table.id));
  const rows = useMemo(
    () => [
      ...new Map([
        ...tables.flatMap((table) =>
          table.tableId
            ? [[table.tableId, { id: table.tableId, name: table.tableName }] as const]
            : [],
        ),
        ...vacantTables.map((table) => [table.id, table] as const),
      ]).values(),
    ],
    [tables, vacantTables],
  );
  const grouped = Map.groupBy(
    sessions.toSorted((a, b) => a.openedAt - b.openedAt || a.id.localeCompare(b.id)),
    (session) => session.tableId,
  );
  function sortValues(row: { id: string; name: string }) {
    const current = today ? currentTables.get(row.id) : undefined;
    const visits = grouped.get(row.id) ?? [];
    return {
      ...row,
      status: current
        ? floorPriority(current)
        : visits.some((visit) => visit.status === "open")
          ? 3
          : 4,
      duration: current
        ? Math.max(0, now - current.openedAt)
        : visits.reduce(
            (total, visit) => total + Math.max(0, (visit.closedAt ?? now) - visit.openedAt),
            0,
          ),
      guests: current?.guestCount ?? visits.reduce((total, visit) => total + visit.guestCount, 0),
      due: current?.bill.due ?? 0,
    };
  }
  const visible = rows
    .filter((row) =>
      row.name.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)),
    )
    .map(sortValues)
    .toSorted((a, b) => compareFloorRows(a, b, sort ?? "table:asc", locale));
  const { viewport, changeZoom } = useTimelineViewport({
    page,
    sessions,
    now,
    today,
    initialScrollLeft,
    scrollRequest,
    zoom,
    onZoomChange,
  });
  useImperativeHandle(ref, () => ({ zoom: changeZoom }));
  const nowPosition = page ? ((now - page.startAt) / (page.endAt - page.startAt)) * 100 : 0;
  const status = (session: TimelineSession) =>
    today && session.status === "open" ? active.get(session.id) : undefined;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_3rem] sm:grid-cols-[5rem_minmax(0,1fr)_3.5rem]">
        <div className="min-w-0 border-r border-border">
          <div className="flex h-12 items-center border-b border-border px-1 text-xs font-medium sm:px-3 sm:text-sm">
            {t("floor_table")}
          </div>
          {visible.map((row) => (
            <div
              key={row.id}
              data-floor-table={row.id}
              className="flex h-16 items-center border-b border-border px-1 text-xs font-semibold last:border-b-0 sm:px-3 sm:text-sm"
            >
              <span className="line-clamp-2 wrap-anywhere" title={row.name}>
                {row.name}
              </span>
            </div>
          ))}
        </div>
        {/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- 横スクロール領域をSafariでも標準キー操作で移動可能にする。 */}
        <div
          tabIndex={0}
          ref={viewport}
          data-scroll-restoration-id={restorationId}
          role="region"
          aria-label={t("floor_timeline")}
          aria-busy={!page}
          className="min-w-0 overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring"
        >
          <div style={{ width: trackWidth }}>
            <div className="relative h-12 border-b border-border text-xs tabular-nums text-muted-foreground">
              {hours
                .filter(
                  (hour) =>
                    hour %
                      (trackWidth >= 1536
                        ? 1
                        : trackWidth >= 768
                          ? 2
                          : trackWidth >= 384
                            ? 4
                            : 8) ===
                    0,
                )
                .map((hour) => (
                  <span
                    key={hour}
                    className="absolute top-4 -translate-x-1/2 first:translate-x-1 last:-translate-x-full"
                    style={{ left: `${(hour / 24) * 100}%` }}
                  >
                    {String(hour).padStart(2, "0")}:00
                  </span>
                ))}
            </div>
            {visible.map((row) => {
              const visits = grouped.get(row.id) ?? [];
              return (
                <div
                  key={row.id}
                  data-floor-row={row.id}
                  className="relative isolate h-16 border-b border-border last:border-b-0"
                >
                  <div aria-hidden className="pointer-events-none absolute inset-0 flex">
                    {hours.slice(0, 24).map((hour) => (
                      <div key={hour} className="h-full flex-1 border-r border-border/50" />
                    ))}
                  </div>
                  {!page && <Skeleton className="absolute top-2 left-4 h-12 w-48" />}
                  {page &&
                    visits.map((session) => (
                      <VisitBand
                        key={session.id}
                        session={session}
                        current={status(session)}
                        page={page}
                        now={now}
                        tableName={row.name}
                        trackWidth={trackWidth}
                        onSelect={onSelect}
                      />
                    ))}
                  {page && visits.length === 0 && (
                    <div className="sticky left-0 inline-flex h-16 items-center px-3 text-xs text-muted-foreground">
                      {today && vacant.has(row.id) ? (
                        <Button variant="outline" size="sm" onClick={() => onOpen(row)}>
                          <Plus aria-hidden />
                          {t("admin_open_table")}
                        </Button>
                      ) : (
                        t(partial ? "floor_incomplete" : "floor_no_visits")
                      )}
                    </div>
                  )}
                  {today && nowPosition >= 0 && nowPosition <= 100 && (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 z-10 border-l-2 border-destructive"
                      style={{ left: `${nowPosition}%` }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {/* oxlint-enable jsx-a11y/no-noninteractive-tabindex */}
        <div className="min-w-0 border-l border-border">
          <div className="flex h-12 items-center justify-center border-b border-border text-xs font-medium">
            {t("floor_visit_count")}
          </div>
          {visible.map((row) => {
            const visits = grouped.get(row.id) ?? [];
            return (
              <div
                key={row.id}
                data-floor-history={row.id}
                className="flex h-16 items-center justify-center border-b border-border last:border-b-0"
              >
                {!page ? (
                  <Skeleton className="size-8" />
                ) : visits.length ? (
                  <VisitList
                    visits={visits}
                    tableName={row.name}
                    currentForSession={status}
                    now={now}
                    onSelect={onSelect}
                    partial={partial}
                  />
                ) : (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {partial ? "—" : "0"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {visible.length === 0 && (
        <p className="p-6 text-muted-foreground">
          {t(rows.length ? "floor_search_empty" : "admin_no_tables")}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span>{t("floor_timezone")}</span>
        {!page && <span role="status">{t("common_loading")}</span>}
        {today && (
          <span className="flex items-center gap-2">
            <span aria-hidden className="h-4 border-l-2 border-destructive" />
            {t("floor_current_time")} {time(now, locale)}
          </span>
        )}
        <span>
          ← {t("floor_previous_day")} · → {t("floor_next_day")}
        </span>
      </div>
    </div>
  );
}
