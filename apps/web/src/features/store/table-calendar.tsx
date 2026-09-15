import type { TableState, TimelinePage, TimelineSession } from "@tablecast/api/schema";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { Bell, CircleDollarSign, TriangleAlert } from "lucide-react";
import { tv } from "tailwind-variants";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { dateTime, time } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { storeDate, visitPosition } from "./floor-model";

const band = tv({
  base: "absolute top-4 flex h-12 min-w-0 items-center overflow-hidden rounded-md border-0 p-0 text-left text-sm ring-1 ring-inset focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  variants: {
    open: {
      true: "bg-primary/15 text-foreground ring-primary/50",
      false: "bg-muted text-foreground ring-border",
    },
  },
});
const hours = Array.from({ length: 25 }, (_, hour) => hour);
const trackWidth = 2304;
const tableWidth = 144;

export function TableCalendar({
  page,
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
}: {
  page: Pick<TimelinePage, "date" | "startAt" | "endAt">;
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
}) {
  const { t, locale } = useI18n();
  const [search, setSearch] = useState("");
  const viewport = useRef<HTMLDivElement>(null);
  const today = page.date === storeDate(now);
  const active = new Map(tables.map((table) => [table.id, table]));
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
  const visible = rows.filter((row) => row.name.toLowerCase().includes(search.toLowerCase()));
  const initialiseScroll = useEffectEvent((request: number) => {
    const element = viewport.current;
    if (!element) return;
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
    initialiseScroll(scrollRequest);
  }, [scrollRequest]);
  const nowPosition = ((now - page.startAt) / (page.endAt - page.startAt)) * 100;

  function label(session: TimelineSession, tableName: string) {
    return `${tableName} · ${session.guestCount} ${t("admin_guests")} · ${dateTime(session.openedAt, locale)} – ${session.closedAt === null ? t("admin_open") : dateTime(session.closedAt, locale)}`;
  }
  function status(session: TimelineSession) {
    return today && session.status === "open" ? active.get(session.id) : undefined;
  }
  return (
    <div className="space-y-4">
      <Input
        type="search"
        aria-label={t("floor_search")}
        placeholder={t("floor_search")}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="max-w-sm"
      />
      {/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- 横スクロール領域をSafariでも標準キー操作で移動可能にする。 */}
      <div
        tabIndex={0}
        ref={viewport}
        data-scroll-restoration-id={restorationId}
        role="region"
        aria-label={t("floor_timeline")}
        className="max-h-96 overflow-auto rounded-lg border border-border bg-card focus-visible:outline-2 focus-visible:outline-ring"
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
          {visible.map((row) => (
            <div key={row.id} className="flex min-h-20 border-b border-border last:border-b-0">
              <div
                className="sticky left-0 z-20 flex shrink-0 flex-col justify-center border-r border-border bg-card px-3 py-2"
                style={{ width: tableWidth }}
              >
                <strong>{row.name}</strong>
                {today && vacant.has(row.id) ? (
                  <Button
                    variant="ghost"
                    className="min-h-11 justify-start px-0 text-xs"
                    onClick={() => onOpen(row)}
                  >
                    {t("admin_open_table")}
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {t("floor_visit_count")}: {(grouped.get(row.id) ?? []).length}
                  </span>
                )}
              </div>
              <div className="relative grow">
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex">
                  {hours.slice(0, 24).map((hour) => (
                    <div key={hour} className="h-full flex-1 border-r border-border/50" />
                  ))}
                </div>
                {(grouped.get(row.id) ?? []).map((session) => {
                  const position = visitPosition(session, page.startAt, page.endAt, now);
                  const current = status(session);
                  return position.width > 0 ? (
                    <Button
                      key={session.id}
                      variant="ghost"
                      className={band({ open: session.status === "open" })}
                      style={{ left: `${position.left}%`, width: `${position.width}%` }}
                      onClick={() => onSelect(session.id)}
                      aria-label={label(session, row.name)}
                      title={label(session, row.name)}
                    >
                      {(position.width * trackWidth) / 100 >= 80 && (
                        <span className="min-w-0 whitespace-nowrap px-2">
                          <span className="block truncate font-medium">
                            {position.continuesBefore ? "← " : ""}
                            {session.guestCount} {t("admin_guests")} ·{" "}
                            {t(session.status === "open" ? "admin_open" : "admin_closed")}
                            {position.continuesAfter ? " →" : ""}
                          </span>
                          <span className="flex items-center gap-1 text-xs">
                            <VisitAttention current={current} />
                            {time(session.openedAt, locale)}
                            {session.closedAt === null
                              ? " –"
                              : ` – ${time(session.closedAt, locale)}`}
                          </span>
                        </span>
                      )}
                    </Button>
                  ) : null;
                })}
                {today && nowPosition >= 0 && nowPosition <= 100 && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 z-10 border-l-2 border-destructive"
                    style={{ left: `${nowPosition}%` }}
                  />
                )}
              </div>
            </div>
          ))}
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
      <details className="rounded-lg border border-border bg-card">
        <summary className="min-h-12 cursor-pointer px-4 py-3 font-medium">
          {t("floor_visits")}
        </summary>
        <div className="divide-y divide-border px-4">
          {visible.map((row) => (
            <section key={row.id} className="py-3" aria-label={row.name}>
              <h3 className="mb-1 font-semibold">{row.name}</h3>
              {(grouped.get(row.id) ?? []).map((session) => (
                <Button
                  key={session.id}
                  variant="ghost"
                  onClick={() => onSelect(session.id)}
                  className="flex min-h-12 w-full justify-start whitespace-normal text-left"
                >
                  <span>
                    <span className="block">{label(session, row.name)}</span>
                    <span className="flex flex-wrap items-center gap-2 text-xs">
                      <VisitAttention current={status(session)} verbose />
                      {session.openedAt === session.closedAt && t("floor_zero")}
                    </span>
                  </span>
                </Button>
              ))}
              {!grouped.get(row.id)?.length && (
                <p className="text-sm text-muted-foreground">
                  {t(partial ? "floor_incomplete" : "floor_no_visits")}
                </p>
              )}
            </section>
          ))}
        </div>
      </details>
    </div>
  );
}

function VisitAttention({ current, verbose = false }: { current?: TableState; verbose?: boolean }) {
  const { t } = useI18n();
  return (
    <>
      {current?.staffCalled && (
        <span className="inline-flex items-center gap-1" title={t("admin_attention")}>
          <Bell aria-label={t("admin_attention")} className="size-4" />
          {verbose && t("admin_attention")}
        </span>
      )}
      {current?.billRequested && current.bill.due > 0 && (
        <span className="inline-flex items-center gap-1" title={t("admin_billing")}>
          <CircleDollarSign aria-label={t("admin_billing")} className="size-4" />
          {verbose && t("admin_billing")}
        </span>
      )}
      {current?.voiceState === "error" && (
        <span
          className="inline-flex items-center gap-1 text-destructive"
          title={t("admin_voice_errors")}
        >
          <TriangleAlert aria-label={t("admin_voice_errors")} className="size-4" />
          {verbose && t("admin_voice_errors")}
        </span>
      )}
    </>
  );
}
