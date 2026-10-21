import * as Disclosure from "../../components/ui/disclosure";
import type { TableState, TimelinePage, TimelineSession } from "@tablecast/api/schema";
import { useEffect, useEffectEvent, useMemo, useRef } from "react";
import {
  Bell,
  CircleDollarSign,
  TriangleAlert,
  Users,
  Clock3,
  Table2,
  Plus,
  ReceiptText,
} from "lucide-react";
import { tv } from "tailwind-variants";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { Badge } from "../../components/ui/badge";
import { LanguageLabel } from "../../components/language-label";
import { dateTime, time, money } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { storeDate, visitPosition } from "./floor-model";

const band = tv({
  base: "relative my-3 flex h-auto min-w-0 flex-col items-start justify-start gap-2 overflow-hidden rounded-xl border-0 bg-(image:--surface-sheen) p-0 text-left text-sm shadow-control ring-1 ring-inset focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  variants: {
    tone: {
      info: "bg-info-soft text-foreground ring-info-border hover:bg-info-hover active:bg-info-selected dark:hover:bg-info-hover",
      warning:
        "bg-warning-soft text-foreground ring-warning-border hover:bg-warning-hover active:bg-warning-selected dark:hover:bg-warning-hover",
      destructive:
        "bg-destructive-soft text-foreground ring-destructive-border hover:bg-destructive-hover active:bg-destructive-selected dark:hover:bg-destructive-hover",
      inactive:
        "bg-control text-foreground ring-control-edge hover:bg-control-hover active:bg-control-selected dark:hover:bg-control-hover",
    },
  },
});
const hours = Array.from({ length: 25 }, (_, hour) => hour);
const trackWidth = 2304;
const tableWidth = 208;

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
}) {
  const { t, locale } = useI18n();
  const viewport = useRef<HTMLDivElement>(null);
  const today = (page?.date ?? date) === storeDate(now);
  const active = new Map(tables.map((table) => [table.id, table]));
  const currentTables = new Map(tables.map((table) => [table.tableId, table]));
  const vacant = new Set(vacantTables.map((table) => table.id));
  const rows = useMemo(
    () =>
      [
        ...new Map([
          ...tables.flatMap((table) =>
            table.tableId
              ? [[table.tableId, { id: table.tableId, name: table.tableName }] as const]
              : [],
          ),
          ...vacantTables.map((table) => [table.id, table] as const),
        ]).values(),
      ].toSorted((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    [tables, vacantTables],
  );
  const grouped = Map.groupBy(
    sessions.toSorted((a, b) => a.openedAt - b.openedAt || a.id.localeCompare(b.id)),
    (session) => session.tableId,
  );
  const visible = rows.filter((row) =>
    row.name.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)),
  );
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
              (element.clientWidth - tableWidth) / 2,
          );
    element.scrollLeft = request ? position : (initialScrollLeft ?? position);
  });
  useEffect(() => {
    if (page?.date) initialiseScroll(scrollRequest);
  }, [scrollRequest, page?.date]);
  const nowPosition = page ? ((now - page.startAt) / (page.endAt - page.startAt)) * 100 : 0;

  function label(session: TimelineSession, tableName: string) {
    return `${tableName} · ${session.guestCount} ${t("admin_guests")} · ${dateTime(session.openedAt, locale)} ${locale === "ja" ? "から" : "to"} ${session.closedAt === null ? t("admin_open") : dateTime(session.closedAt, locale)}`;
  }
  function status(session: TimelineSession) {
    return today && session.status === "open" ? active.get(session.id) : undefined;
  }
  return (
    <div className="space-y-4">
      {/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- 横スクロール領域をSafariでも標準キー操作で移動可能にする。 */}
      <div
        tabIndex={0}
        ref={viewport}
        data-scroll-restoration-id={restorationId}
        role="region"
        aria-label={t("floor_timeline")}
        aria-busy={!page}
        className="overflow-auto rounded-2xl border border-border bg-card focus-visible:outline-2 focus-visible:outline-ring"
      >
        <div style={{ width: tableWidth + trackWidth }}>
          <div className="sticky top-0 z-30 flex h-12 border-b border-border bg-card">
            <div
              className="sticky left-0 z-40 flex shrink-0 items-center border-r border-border bg-card px-4 font-medium"
              style={{ width: tableWidth }}
            >
              {t("floor_table")}
            </div>
            <div className="relative grow text-xs tabular-nums text-muted-foreground">
              {hours.map((hour) => (
                <span
                  key={hour}
                  className="absolute top-4 -translate-x-1/2 first:translate-x-1 last:-translate-x-full"
                  style={{ left: `${(hour / 24) * 100}%` }}
                >
                  {String(hour).padStart(2, "0")}:00
                </span>
              ))}
            </div>
          </div>
          {visible.map((row) => {
            const current = today ? currentTables.get(row.id) : undefined;
            return (
              <div key={row.id} className="flex min-h-80 border-b border-border last:border-b-0">
                <div
                  className="sticky left-0 z-20 flex shrink-0 flex-col border-r border-border bg-card p-4"
                  style={{ width: tableWidth }}
                >
                  <span className="mb-2 flex items-center gap-2">
                    <Table2 className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                    <strong className="min-w-0 wrap-anywhere">{row.name}</strong>
                  </span>
                  {current ? (
                    <CurrentVisitSummary current={current} now={now} />
                  ) : !page ? (
                    <Skeleton className="mt-1 h-4 w-16" />
                  ) : today && vacant.has(row.id) ? (
                    <div className="space-y-3">
                      <Badge variant="inactive">{t("admin_vacant")}</Badge>
                      <Button variant="outline" size="sm" onClick={() => onOpen(row)}>
                        <Plus aria-hidden />
                        {t("admin_open_table")}
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {t("floor_visit_count")}: {(grouped.get(row.id) ?? []).length}
                    </span>
                  )}
                </div>
                <div className="relative grid min-w-0 grow grid-cols-1">
                  <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex">
                    {hours.slice(0, 24).map((hour) => (
                      <div key={hour} className="h-full flex-1 border-r border-border/50" />
                    ))}
                  </div>
                  {!page && <Skeleton className="absolute top-4 left-4 h-12 w-96" />}
                  {page &&
                    (grouped.get(row.id) ?? []).map((session) => (
                      <VisitBand
                        key={session.id}
                        session={session}
                        current={status(session)}
                        page={page}
                        now={now}
                        label={label(session, row.name)}
                        onSelect={onSelect}
                      />
                    ))}
                  {today && nowPosition >= 0 && nowPosition <= 100 && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 z-10 border-l-2 border-destructive"
                      style={{ left: `${nowPosition}%` }}
                    />
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
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <span>{t("floor_timezone")}</span>
        {!page && <span role="status">{t("common_loading")}</span>}
        {today && (
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="h-4 border-l-2 border-destructive" />
            {t("floor_current_time")} {time(now, locale)}
          </span>
        )}
        <span>
          ← {t("floor_previous_day")} · → {t("floor_next_day")}
        </span>
      </div>
      <Disclosure.Root className="rounded-lg border border-border bg-card">
        <Disclosure.Trigger className="min-h-12 cursor-pointer px-4 py-3 font-medium">
          {t("floor_visits")}
        </Disclosure.Trigger>
        <Disclosure.Panel>
          <div className="divide-y divide-border px-4">
            {visible.map((row) => (
              <section key={row.id} className="py-3" aria-label={row.name}>
                <h3 className="mb-1 font-semibold">{row.name}</h3>
                {(grouped.get(row.id) ?? []).map((session) => {
                  const current = status(session);
                  return (
                    <Button
                      key={session.id}
                      variant="ghost"
                      onClick={() => onSelect(session.id)}
                      className="flex min-h-12 w-full justify-start whitespace-normal text-left"
                    >
                      <span>
                        <span className="block">{label(session, row.name)}</span>
                        <span className="mt-2 inline-flex items-center gap-1.5 text-sm tabular-nums">
                          <Clock3 className="size-4 text-muted-foreground" aria-hidden />
                          {Math.max(
                            0,
                            Math.floor(((session.closedAt ?? now) - session.openedAt) / 60_000),
                          )}{" "}
                          {t("kiosk_minutes")}
                        </span>
                        <span className="flex flex-wrap items-center gap-2 text-xs">
                          <VisitAttention current={current} verbose />
                          {session.openedAt === session.closedAt && t("floor_zero")}
                        </span>
                        {current && (
                          <span className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                            <LanguageLabel locale={current.locale} />
                            <span>
                              {t("admin_ordered")} {money(current.bill.orderedTotal, locale)}
                            </span>
                            <strong>
                              {t("admin_due")} {money(current.bill.due, locale)}
                            </strong>
                          </span>
                        )}
                      </span>
                    </Button>
                  );
                })}
                {!grouped.get(row.id)?.length && (
                  <p className="text-sm text-muted-foreground">
                    {t(!page ? "common_loading" : partial ? "floor_incomplete" : "floor_no_visits")}
                  </p>
                )}
              </section>
            ))}
          </div>
        </Disclosure.Panel>
      </Disclosure.Root>
    </div>
  );
}

function CurrentVisitSummary({ current, now }: { current: TableState; now: number }) {
  const { t, locale } = useI18n();
  return (
    <div className="space-y-3">
      <Badge variant="info">{t("admin_open")}</Badge>
      <div className="flex flex-wrap gap-x-3 gap-y-2 text-xs tabular-nums">
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <Users className="size-4 text-muted-foreground" aria-hidden />
          {current.guestCount} {t("admin_guests")}
        </span>
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <Clock3 className="size-4 text-muted-foreground" aria-hidden />
          {Math.max(0, Math.floor((now - current.openedAt) / 60000))} {t("kiosk_minutes")}
        </span>
      </div>
      <LanguageLabel locale={current.locale} />
      <div className="flex flex-wrap gap-1">
        <VisitAttention current={current} verbose />
      </div>
      <dl className="space-y-2 border-y border-dashed border-border py-3 text-xs tabular-nums">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="inline-flex items-center gap-1 text-muted-foreground">
            <ReceiptText className="size-3" aria-hidden />
            {t("admin_ordered")}
          </dt>
          <dd>{money(current.bill.orderedTotal, locale)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2 font-semibold">
          <dt>{t("admin_due")}</dt>
          <dd className="text-base">{money(current.bill.due, locale)}</dd>
        </div>
        {current.cart.total > 0 && (
          <div className="flex items-baseline justify-between gap-2 text-muted-foreground">
            <dt>{t("admin_cart")}</dt>
            <dd>{money(current.cart.total, locale)}</dd>
          </div>
        )}
      </dl>
    </div>
  );
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
  label,
  onSelect,
}: {
  session: TimelineSession;
  current?: TableState;
  page: Pick<TimelinePage, "startAt" | "endAt">;
  now: number;
  label: string;
  onSelect: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const position = visitPosition(session, page.startAt, page.endAt, now);
  const width = (position.width * trackWidth) / 100;
  const tone = visitTone(session, current);
  const duration = Math.max(0, Math.floor(((session.closedAt ?? now) - session.openedAt) / 60_000));
  return position.width > 0 ? (
    <Button
      variant="ghost"
      className={band({ tone })}
      style={{
        gridArea: "1 / 1",
        marginLeft: `${position.left}%`,
        width: `${position.width}%`,
      }}
      onClick={() => onSelect(session.id)}
      aria-label={label}
      title={label}
    >
      {width >= 80 && (
        <span className="flex w-full min-w-0 flex-col gap-2 p-3">
          <span className="block truncate text-xs font-semibold">
            {position.continuesBefore ? "← " : ""}
            {t(session.status === "open" ? "admin_open" : "admin_closed")}
            {position.continuesAfter ? " →" : ""}
          </span>
          <span className="flex flex-wrap gap-x-3 gap-y-2 text-xs tabular-nums">
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <Users className="size-4" aria-hidden />
              {session.guestCount} {t("admin_guests")}
            </span>
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <Clock3 className="size-4" aria-hidden />
              {duration} {t("kiosk_minutes")}
            </span>
          </span>
          <span className="block truncate text-xs tabular-nums text-muted-foreground">
            {time(session.openedAt, locale)}
            {session.closedAt !== null && ` → ${time(session.closedAt, locale)}`}
          </span>
          <span className="flex flex-wrap gap-2">
            <VisitAttention current={current} verbose={width >= 176} />
          </span>
        </span>
      )}
    </Button>
  ) : null;
}

function VisitAttention({ current, verbose = false }: { current?: TableState; verbose?: boolean }) {
  const { t } = useI18n();
  return (
    <>
      {current?.staffCalled && (
        <Badge variant="warning" className="max-w-full" title={t("admin_attention")}>
          <Bell aria-label={t("admin_attention")} className="size-4" />
          {verbose && t("admin_attention")}
        </Badge>
      )}
      {current?.billRequested && current.bill.due > 0 && (
        <Badge variant="warning" className="max-w-full" title={t("admin_billing")}>
          <CircleDollarSign aria-label={t("admin_billing")} className="size-4" />
          {verbose && t("admin_billing")}
        </Badge>
      )}
      {current?.voiceState === "error" && (
        <Badge variant="destructive" className="max-w-full" title={t("admin_voice_errors")}>
          <TriangleAlert aria-label={t("admin_voice_errors")} className="size-4" />
          {verbose && t("admin_voice_errors")}
        </Badge>
      )}
    </>
  );
}
