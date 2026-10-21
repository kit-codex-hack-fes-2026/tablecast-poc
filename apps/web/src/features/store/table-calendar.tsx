import { detectPlatform } from "@tanstack/react-hotkeys";
import { Popover } from "@base-ui/react/popover";
import type { TableState, TimelinePage, TimelineSession } from "@tablecast/api/schema";
import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type Ref,
} from "react";
import {
  Bell,
  CircleDollarSign,
  TriangleAlert,
  Users,
  Clock3,
  Plus,
  ReceiptText,
  History,
  ChevronRight,
  X,
} from "lucide-react";
import { cn, tv } from "tailwind-variants";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { Badge } from "../../components/ui/badge";
import { surfaceMotion } from "../../components/ui/motion-variants";
import { LanguageLabel } from "../../components/language-label";
import { dateTime, time, money } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { m } from "../../paraglide/messages";
import { TableTimeLimit } from "./table-time-limit";
import {
  tableTimeLimit,
  timeLimitText,
  storeDate,
  visitPosition,
  floorTrackWidth,
  compareFloorRows,
  floorPriority,
  type FloorSort,
  type FloorZoom,
} from "./floor-model";

const band = tv({
  base: "absolute top-2 flex h-12 min-h-12 min-w-0 items-center justify-start overflow-clip rounded-lg border-0 bg-(image:--surface-sheen) p-0 text-left text-xs shadow-control ring-1 ring-inset focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  variants: {
    tone: {
      info: "bg-info-soft text-foreground ring-info-border hover:bg-info-hover active:bg-info-selected aria-expanded:bg-info-selected dark:hover:bg-info-hover",
      warning:
        "bg-warning-soft text-foreground ring-warning-border hover:bg-warning-hover active:bg-warning-selected aria-expanded:bg-warning-selected dark:hover:bg-warning-hover",
      destructive:
        "bg-destructive-soft text-foreground ring-destructive-border hover:bg-destructive-hover active:bg-destructive-selected aria-expanded:bg-destructive-selected dark:hover:bg-destructive-hover",
      inactive:
        "bg-control text-foreground ring-control-edge hover:bg-control-hover active:bg-control-selected aria-expanded:bg-control-selected dark:hover:bg-control-hover",
    },
  },
});
const hours = Array.from({ length: 25 }, (_, hour) => hour);
const popupClass = cn(
  "w-80 max-w-[var(--available-width)] rounded-xl border border-border bg-card p-4 text-foreground shadow-lg",
  surfaceMotion(),
);

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
  ref?: Ref<TableCalendarHandle>;
  page?: Pick<TimelinePage, "date" | "startAt" | "endAt">;
  date?: string;
  sessions: TimelineSession[];
  tables: TableState[];
  vacantTables: { id: string; name: string }[];
  now: number;
  partial?: boolean;
  scrollRequest?: number;
  initialScrollLeft?: number;
  restorationId?: string;
  onSelect: (id: string) => void;
  onOpen: (table: { id: string; name: string }) => void;
  search?: string;
  sort?: FloorSort;
  zoom?: FloorZoom;
  onZoomChange?: (zoom: FloorZoom, options?: { replace?: boolean }) => void;
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

/** 初期位置・倍率・ホイールを時間軸の一つのスクロール領域に限定する。 */
function useTimelineViewport({
  page,
  sessions,
  now,
  today,
  initialScrollLeft,
  scrollRequest,
  zoom,
  onZoomChange,
}: {
  page?: Pick<TimelinePage, "date" | "startAt" | "endAt">;
  sessions: TimelineSession[];
  now: number;
  today: boolean;
  initialScrollLeft?: number;
  scrollRequest: number;
  zoom: FloorZoom;
  onZoomChange?: (zoom: FloorZoom, options?: { replace?: boolean }) => void;
}) {
  const trackWidth = floorTrackWidth(zoom);
  const viewport = useRef<HTMLDivElement>(null);
  const zoomAnchor = useRef<{ offset: number; ratio: number } | null>(null);
  const lastWheel = useRef(-Infinity);
  const wheelDelta = useRef(0);
  const wheelGesture = useRef(false);
  const initialiseScroll = useEffectEvent((request: number) => {
    const element = viewport.current;
    if (!element || !page) return;
    const target = today
      ? now
      : Math.min(
          ...sessions.map((session) => Math.max(session.openedAt, page.startAt)),
          page.endAt,
        );
    const position =
      target === page.endAt
        ? 0
        : Math.max(
            0,
            ((target - page.startAt) / (page.endAt - page.startAt)) * trackWidth -
              element.clientWidth / 2,
          );
    element.scrollLeft = request ? position : (initialScrollLeft ?? position);
  });
  useEffect(() => {
    if (page?.date) initialiseScroll(scrollRequest);
  }, [scrollRequest, page?.date]);
  // 明示的な倍率操作だけを補正し、戻る・進むの位置復元はRouterへ任せる。
  useEffect(() => {
    const element = viewport.current;
    const anchor = zoomAnchor.current;
    if (element && anchor) {
      element.scrollLeft = Math.round(anchor.ratio * trackWidth - anchor.offset);
      zoomAnchor.current = null;
    }
  }, [trackWidth]);
  function changeZoom(next: FloorZoom, options?: { replace?: boolean }, offset?: number) {
    const element = viewport.current;
    if (!element || !onZoomChange || next === zoom) return;
    const anchorOffset = offset ?? element.clientWidth / 2;
    zoomAnchor.current = {
      offset: anchorOffset,
      ratio: Math.min(1, Math.max(0, (element.scrollLeft + anchorOffset) / trackWidth)),
    };
    onZoomChange(next, options);
  }
  useEffect(() => {
    const element = viewport.current;
    if (!element) return undefined;
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      const nextWidth = element.clientWidth;
      if (nextWidth !== width) {
        element.scrollLeft += (width - nextWidth) / 2;
        width = nextWidth;
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const zoomWithWheel = useEffectEvent((event: WheelEvent) => {
    const shortcut = detectPlatform() === "mac" ? event.metaKey : event.ctrlKey;
    const element = viewport.current;
    if (!shortcut || !element || !onZoomChange || event.deltaY === 0) return;
    event.preventDefault();
    if (event.timeStamp - lastWheel.current >= 300) {
      wheelDelta.current = 0;
      wheelGesture.current = false;
    }
    lastWheel.current = event.timeStamp;
    wheelDelta.current +=
      event.deltaY *
      (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1);
    const steps = Math.trunc(wheelDelta.current / 100);
    if (!steps) return;
    wheelDelta.current -= steps * 100;
    const next = Math.min(300, Math.max(10, zoom - steps * 10));
    if (next === zoom) return;
    const offset = event.clientX - element.getBoundingClientRect().left;
    changeZoom(next, { replace: wheelGesture.current }, offset);
    wheelGesture.current = true;
  });
  useEffect(() => {
    const element = viewport.current;
    if (!element) return undefined;
    const handleWheel = (event: WheelEvent) => zoomWithWheel(event);
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, []);
  return { viewport, changeZoom };
}

function visitLabel(
  session: TimelineSession,
  tableName: string,
  locale: "ja" | "en",
  guests: string,
  open: string,
) {
  return `${tableName} · ${session.guestCount} ${guests} · ${dateTime(session.openedAt, locale)} ${locale === "ja" ? "から" : "to"} ${session.closedAt === null ? open : dateTime(session.closedAt, locale)}`;
}
function visitTone(session: TimelineSession, current?: TableState) {
  if (current?.staffCalled || (current?.billRequested && current.bill.due > 0)) return "warning";
  if (current?.voiceState === "error") return "destructive";
  return session.status === "open" ? "info" : "inactive";
}
function VisitBand({
  session,
  current,
  page,
  now,
  tableName,
  trackWidth,
  onSelect,
}: {
  session: TimelineSession;
  current?: TableState;
  page: Pick<TimelinePage, "startAt" | "endAt">;
  now: number;
  tableName: string;
  trackWidth: number;
  onSelect: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const position = visitPosition(session, page.startAt, page.endAt, now);
  const width = (position.width * trackWidth) / 100;
  const currentLabel = current
    ? ` · ${t(current.locale === "ja" ? "common_language_native_ja" : "common_language_native_en")} · ${timeLimitText(tableTimeLimit(current.plan, now), locale)}`
    : "";
  if (position.width <= 0) return null;
  return (
    <VisitPreview
      session={session}
      current={current}
      now={now}
      tableName={tableName}
      onSelect={onSelect}
      trigger={
        <Button
          variant="ghost"
          className={band({ tone: visitTone(session, current) })}
          style={{ left: `${position.left}%`, width: `${position.width}%` }}
          aria-label={`${visitLabel(session, tableName, locale, t("admin_guests"), t("admin_open"))}${currentLabel} · ${t("floor_show_summary")}`}
        >
          {width >= 72 && (
            <VisitBandLabel
              session={session}
              current={current}
              now={now}
              width={width}
              position={position}
            />
          )}
        </Button>
      }
    />
  );
}
function VisitBandLabel({
  session,
  current,
  now,
  width,
  position,
}: {
  session: TimelineSession;
  current?: TableState;
  now: number;
  width: number;
  position: ReturnType<typeof visitPosition>;
}) {
  const { t, locale } = useI18n();
  const duration = Math.max(0, Math.floor(((session.closedAt ?? now) - session.openedAt) / 60_000));
  return (
    <span className="sticky left-0 w-0 shrink-0">
      <span className="flex w-max flex-col gap-0.5 px-2 py-1">
        <span className="flex items-center gap-2 whitespace-nowrap font-semibold">
          {current && <LanguageLabel locale={current.locale} compact />}
          {current && <TableTimeLimit plan={current.plan} now={now} compact />}
          <span>
            {position.continuesBefore && "← "}
            {t(session.status === "open" ? "admin_open" : "admin_closed")}
            {position.continuesAfter && " →"}
          </span>
          <VisitAttention current={current} />
        </span>
        <span className="flex items-center gap-3 whitespace-nowrap tabular-nums">
          <span className="inline-flex items-center gap-1">
            <Users aria-hidden className="size-3" />
            {session.guestCount}
          </span>
          {width >= 128 && (
            <span className="inline-flex items-center gap-1">
              <Clock3 aria-hidden className="size-3" />
              {m.floor_elapsed({ minutes: duration }, { locale })}
            </span>
          )}
          {width >= 240 && current && (
            <span>{timeLimitText(tableTimeLimit(current.plan, now), locale)}</span>
          )}
          {width >= 400 && current && (
            <span>
              {t("admin_due")} {money(current.bill.due, locale)}
            </span>
          )}
          {width >= 500 && (
            <span className="text-muted-foreground">
              {time(session.openedAt, locale)}
              {session.closedAt !== null && ` → ${time(session.closedAt, locale)}`}
            </span>
          )}
        </span>
      </span>
    </span>
  );
}

function VisitPreview({
  session,
  current,
  now,
  tableName,
  onSelect,
  trigger,
}: {
  session: TimelineSession;
  current?: TableState;
  now: number;
  tableName: string;
  onSelect: (id: string) => void;
  trigger: ReactElement;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const triggerElement = useRef<HTMLButtonElement>(null);
  const restoringFocus = useRef(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        ref={triggerElement}
        openOnHover
        delay={200}
        closeDelay={150}
        render={trigger}
        onFocus={(event) => {
          if (!restoringFocus.current && event.currentTarget.matches(":focus-visible"))
            setOpen(true);
        }}
      />
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="start" className="z-50">
          <Popover.Popup
            render={(props, state) => (
              <div {...props} inert={!state.open} aria-hidden={!state.open || undefined} />
            )}
            initialFocus={false}
            finalFocus={() => {
              // 閉じた後のfocus復帰を新たな閲覧操作として扱わず、横位置も保つ。
              restoringFocus.current = true;
              triggerElement.current?.focus({ preventScroll: true });
              restoringFocus.current = false;
              return false;
            }}
            className={popupClass}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <Popover.Title className="font-semibold">
                {tableName} · {t("floor_summary")}
              </Popover.Title>
              <Popover.Close
                render={<Button variant="ghost" size="icon-sm" />}
                aria-label={t("common_close")}
              >
                <X aria-hidden />
              </Popover.Close>
            </div>
            <VisitSummary session={session} current={current} now={now} />
            <Button
              variant="outline"
              className="mt-4 w-full justify-between"
              onClick={() => onSelect(session.id)}
            >
              {t("floor_open_details")}
              <ChevronRight aria-hidden />
            </Button>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
function VisitSummary({
  session,
  current,
  now,
}: {
  session: TimelineSession;
  current?: TableState;
  now: number;
}) {
  const { t, locale } = useI18n();
  const duration = Math.max(0, Math.floor(((session.closedAt ?? now) - session.openedAt) / 60_000));
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={visitTone(session, current)}>
          {t(session.status === "open" ? "admin_open" : "admin_closed")}
        </Badge>
        <VisitAttention current={current} verbose />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 tabular-nums">
        <span className="inline-flex items-center gap-1.5">
          <Users aria-hidden className="size-4 text-muted-foreground" />
          {session.guestCount} {t("admin_guests")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock3 aria-hidden className="size-4 text-muted-foreground" />
          {m.floor_elapsed({ minutes: duration }, { locale })}
        </span>
        {current && <LanguageLabel locale={current.locale} />}
      </div>
      <p className="text-xs text-muted-foreground">
        {dateTime(session.openedAt, locale)}
        {session.closedAt !== null && <> → {dateTime(session.closedAt, locale)}</>}
      </p>
      <TableTimeLimit plan={current?.plan} now={now} detail />
      {current && (
        <dl className="space-y-2 border-t border-border pt-3 tabular-nums">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
              <ReceiptText aria-hidden className="size-4" />
              {t("admin_ordered")}
            </dt>
            <dd>{money(current.bill.orderedTotal, locale)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 font-semibold">
            <dt>{t("admin_due")}</dt>
            <dd>{money(current.bill.due, locale)}</dd>
          </div>
          {current.cart.total > 0 && (
            <div className="flex items-baseline justify-between gap-3 text-muted-foreground">
              <dt>{t("admin_cart")}</dt>
              <dd>{money(current.cart.total, locale)}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
function VisitAttention({ current, verbose = false }: { current?: TableState; verbose?: boolean }) {
  const { t } = useI18n();
  return (
    <>
      {current?.staffCalled && (
        <span className="inline-flex items-center gap-1 text-warning">
          <Bell aria-label={t("admin_attention")} className="size-3.5 shrink-0" />
          {verbose && t("admin_attention")}
        </span>
      )}
      {current?.billRequested && current.bill.due > 0 && (
        <span className="inline-flex items-center gap-1 text-warning">
          <CircleDollarSign aria-label={t("admin_billing")} className="size-3.5 shrink-0" />
          {verbose && t("admin_billing")}
        </span>
      )}
      {current?.voiceState === "error" && (
        <span className="inline-flex items-center gap-1 text-destructive">
          <TriangleAlert aria-label={t("admin_voice_errors")} className="size-3.5 shrink-0" />
          {verbose && t("admin_voice_errors")}
        </span>
      )}
    </>
  );
}

/** 短時間・0分・重なる来店にも、正確な時間幅を広げず44px以上の操作を用意する。 */
function VisitList({
  visits,
  tableName,
  currentForSession,
  now,
  onSelect,
  partial,
}: {
  visits: TimelineSession[];
  tableName: string;
  currentForSession: (session: TimelineSession) => TableState | undefined;
  partial: boolean;
  now: number;
  onSelect: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  return (
    <Popover.Root>
      <Popover.Trigger
        render={<Button variant="ghost" size="icon-sm" className="flex-col gap-0.5 text-xs" />}
        aria-label={
          partial
            ? m.floor_visits_partial({ table: tableName, count: visits.length }, { locale })
            : m.floor_visits({ table: tableName, count: visits.length }, { locale })
        }
      >
        <History aria-hidden className="size-4" />
        <span className="tabular-nums">
          {visits.length}
          {partial && "+"}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end" className="z-50">
          <Popover.Popup
            render={(props, state) => (
              <div {...props} inert={!state.open} aria-hidden={!state.open || undefined} />
            )}
            className={cn(popupClass, "max-h-[min(32rem,var(--available-height))] overflow-y-auto")}
          >
            <Popover.Title className="mb-3 font-semibold">
              {tableName} · {t("floor_history")}
            </Popover.Title>
            {partial && (
              <p className="mb-3 text-xs text-muted-foreground">{t("floor_history_loaded")}</p>
            )}
            <div className="space-y-3">
              {visits.map((session) => (
                <div key={session.id} className="rounded-lg bg-surface-subtle p-3">
                  <VisitSummary session={session} current={currentForSession(session)} now={now} />
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full justify-between"
                    aria-label={`${visitLabel(session, tableName, locale, t("admin_guests"), t("admin_open"))} · ${t("floor_open_details")}`}
                    onClick={() => onSelect(session.id)}
                  >
                    {t("floor_open_details")}
                    <ChevronRight aria-hidden />
                  </Button>
                </div>
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
