import { Popover } from "@base-ui/react/popover";
import type { TableState, TimelinePage, TimelineSession } from "@tablecast/api/schema";
import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactElement } from "react";
import {
  Bell,
  CircleDollarSign,
  TriangleAlert,
  Users,
  Clock3,
  Plus,
  ReceiptText,
  List,
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
import {
  storeDate,
  visitPosition,
  floorTrackWidths,
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
const tableWidth = 112;
const visitsWidth = 88;
const hours = Array.from({ length: 25 }, (_, hour) => hour);
const popupClass = cn(
  "w-80 max-w-[var(--available-width)] rounded-xl border border-border bg-card p-4 text-foreground shadow-lg",
  surfaceMotion(),
);

export function TableCalendar({
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
  zoom = "normal",
}: {
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
}) {
  const { t, locale } = useI18n();
  const viewport = useRef<HTMLDivElement>(null);
  const trackWidth = floorTrackWidths[zoom];
  const previousWidth = useRef(trackWidth);
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
              (element.clientWidth - tableWidth - visitsWidth) / 2,
          );
    element.scrollLeft = request ? position : (initialScrollLeft ?? position);
  });
  useEffect(() => {
    if (page?.date) initialiseScroll(scrollRequest);
  }, [scrollRequest, page?.date]);
  // 拡大しても見ている時刻を中央に保ち、通知更新では横位置を変えない。
  useEffect(() => {
    const element = viewport.current;
    if (element && previousWidth.current !== trackWidth) {
      const centre = (element.clientWidth - tableWidth - visitsWidth) / 2;
      const timeRatio = (element.scrollLeft + centre) / previousWidth.current;
      element.scrollLeft = timeRatio * trackWidth - centre;
    }
    previousWidth.current = trackWidth;
  }, [trackWidth]);
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
  const nowPosition = page ? ((now - page.startAt) / (page.endAt - page.startAt)) * 100 : 0;
  const status = (session: TimelineSession) =>
    today && session.status === "open" ? active.get(session.id) : undefined;
  return (
    <div className="space-y-3">
      {/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- 横スクロール領域をSafariでも標準キー操作で移動可能にする。 */}
      <div
        tabIndex={0}
        ref={viewport}
        data-scroll-restoration-id={restorationId}
        role="region"
        aria-label={t("floor_timeline")}
        aria-busy={!page}
        className="overflow-x-auto rounded-2xl border border-border bg-card focus-visible:outline-2 focus-visible:outline-ring"
      >
        <div style={{ width: tableWidth + trackWidth + visitsWidth }}>
          <div className="sticky top-0 z-30 flex h-12 border-b border-border bg-card">
            <div
              className="sticky left-0 z-40 flex shrink-0 items-center border-r border-border bg-card px-4 text-sm font-medium"
              style={{ width: tableWidth }}
            >
              {t("floor_table")}
            </div>
            <div className="relative grow text-xs tabular-nums text-muted-foreground">
              {hours
                .filter((hour) => zoom !== "compact" || hour % 2 === 0)
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
            <div
              className="sticky right-0 z-40 flex shrink-0 items-center justify-center border-l border-border bg-card text-xs font-medium"
              style={{ width: visitsWidth }}
            >
              {t("floor_visit_count")}
            </div>
          </div>
          {visible.map((row) => {
            const visits = grouped.get(row.id) ?? [];
            return (
              <div
                key={row.id}
                data-floor-row={row.id}
                className="flex h-16 border-b border-border last:border-b-0"
              >
                <div
                  className="sticky left-0 z-20 flex shrink-0 items-center border-r border-border bg-card px-4 text-sm font-semibold"
                  style={{ width: tableWidth }}
                >
                  <span className="line-clamp-2 wrap-anywhere" title={row.name}>
                    {row.name}
                  </span>
                </div>
                <div className="relative isolate min-w-0 grow">
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
                    <div className="sticky top-2 left-32 inline-flex h-16 items-center px-3 text-xs text-muted-foreground">
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
                <div
                  className="sticky right-0 z-20 flex shrink-0 items-center justify-center border-l border-border bg-card"
                  style={{ width: visitsWidth }}
                >
                  {!page ? (
                    <Skeleton className="h-8 w-12" />
                  ) : visits.length ? (
                    <VisitList
                      visits={visits}
                      tableName={row.name}
                      currentForSession={status}
                      now={now}
                      onSelect={onSelect}
                    />
                  ) : (
                    <span className="text-xs tabular-nums text-muted-foreground">0</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {visible.length === 0 && (
          <p className="sticky left-0 w-fit p-6 text-muted-foreground">
            {t(rows.length ? "floor_search_empty" : "admin_no_tables")}
          </p>
        )}
      </div>
      {/* oxlint-enable jsx-a11y/no-noninteractive-tabindex */}
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
  const duration = Math.max(0, Math.floor(((session.closedAt ?? now) - session.openedAt) / 60_000));
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
          aria-label={visitLabel(session, tableName, locale, t("admin_guests"), t("admin_open"))}
        >
          {width >= 72 && (
            <span className="sticky left-28 w-0 shrink-0">
              <span className="flex w-max flex-col gap-0.5 px-2 py-1">
                <span className="flex min-w-0 items-center gap-2 whitespace-nowrap font-semibold">
                  <span>
                    {position.continuesBefore && "← "}
                    {t(session.status === "open" ? "admin_open" : "admin_closed")}
                    {position.continuesAfter && " →"}
                  </span>
                  <VisitAttention current={current} />
                  {width >= 240 && current && (
                    <span className="ml-auto tabular-nums">
                      {t("admin_due")} {money(current.bill.due, locale)}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-3 whitespace-nowrap tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    <Users aria-hidden className="size-3" />
                    {session.guestCount}
                  </span>
                  {width >= 128 && (
                    <span className="inline-flex items-center gap-1">
                      <Clock3 aria-hidden className="size-3" />
                      {duration} {t("kiosk_minutes")}
                    </span>
                  )}
                  {width >= 240 && (
                    <span className="text-muted-foreground">
                      {time(session.openedAt, locale)}
                      {session.closedAt !== null && ` → ${time(session.closedAt, locale)}`}
                    </span>
                  )}
                </span>
              </span>
            </span>
          )}
        </Button>
      }
    />
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
                {tableName} · {t("object_visit")}
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
              {t("object_visit")}
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
          {duration} {t("kiosk_minutes")}
        </span>
        {current && <LanguageLabel locale={current.locale} />}
      </div>
      <p className="text-xs text-muted-foreground">
        {dateTime(session.openedAt, locale)}
        {session.closedAt !== null && <> → {dateTime(session.closedAt, locale)}</>}
      </p>
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
}: {
  visits: TimelineSession[];
  tableName: string;
  currentForSession: (session: TimelineSession) => TableState | undefined;
  now: number;
  onSelect: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  return (
    <Popover.Root>
      <Popover.Trigger
        render={<Button variant="ghost" size="sm" />}
        aria-label={`${tableName} ${t("floor_visits")}`}
      >
        <List aria-hidden />
        <span className="tabular-nums">{visits.length}</span>
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
              {tableName} · {t("floor_visit_count")}
            </Popover.Title>
            <div className="space-y-3">
              {visits.map((session) => (
                <div key={session.id} className="rounded-lg bg-surface-subtle p-3">
                  <VisitSummary session={session} current={currentForSession(session)} now={now} />
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full justify-between"
                    aria-label={visitLabel(
                      session,
                      tableName,
                      locale,
                      t("admin_guests"),
                      t("admin_open"),
                    )}
                    onClick={() => onSelect(session.id)}
                  >
                    {t("object_visit")}
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
