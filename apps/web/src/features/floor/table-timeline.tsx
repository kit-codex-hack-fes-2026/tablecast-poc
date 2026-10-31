import type { TableState } from "@tablecast/api/schema";
import { uiLocale } from "@tablecast/api/localization";
import {
  Bell,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Plus,
  ReceiptText,
  Table2,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { LanguageLabel } from "../../components/language-label";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { money } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { m } from "../../paraglide/messages";
import { compareFloorRows, type FloorFilter, floorPriority, type FloorSort } from "./floor-model";
import { TableTimeLimit } from "./table-time-limit";

type FloorRow = { id: string; name: string; visit: null | TableState };
export function TableTimeline({
  tables,
  vacantTables = [],
  onSelect,
  onOpen,
  initialNow,
  pending = false,
  filter = "all",
  search = "",
  sort,
}: {
  filter?: FloorFilter;
  initialNow?: number;
  onOpen?: (table: { id: string; name: string }) => void;
  onSelect: (id: string) => void;
  pending?: boolean;
  search?: string;
  sort?: FloorSort;
  tables: TableState[];
  vacantTables?: { id: string; name: string }[];
}) {
  const { locale, t } = useI18n();
  const [now, setNow] = useState(() => initialNow ?? Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  // 更新のたびに操作中の卓を動かさず、初回の要対応順を保つ。
  const [initialOrder] = useState(
    () =>
      new Map(
        [...tables]
          .toSorted(
            (a, b) => floorPriority(a) - floorPriority(b) || a.tableName.localeCompare(b.tableName),
          )
          .map((item, index) => [item.id, index]),
      ),
  );
  const rows: FloorRow[] = [
    ...[...tables]
      .toSorted(
        (a, b) =>
          (initialOrder.get(a.id) ?? Infinity) - (initialOrder.get(b.id) ?? Infinity) ||
          a.tableName.localeCompare(b.tableName),
      )
      .map((visit) => ({ id: visit.id, name: visit.tableName, visit })),
    ...vacantTables.map((item) => ({ ...item, visit: null })),
  ];
  const ordered = sort
    ? rows.toSorted((a, b) =>
        compareFloorRows(
          {
            ...a,
            status: floorPriority(a.visit),
            duration: a.visit ? Math.max(0, now - a.visit.openedAt) : 0,
            guests: a.visit?.guestCount ?? 0,
            due: a.visit?.bill.due ?? 0,
          },
          {
            ...b,
            status: floorPriority(b.visit),
            duration: b.visit ? Math.max(0, now - b.visit.openedAt) : 0,
            guests: b.visit?.guestCount ?? 0,
            due: b.visit?.bill.due ?? 0,
          },
          sort,
          locale,
        ),
      )
    : rows;
  const filtered = ordered.filter(({ visit, name }) => {
    if (!name.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)))
      return false;
    if (filter === "all") return true;
    if (filter === "vacant") return !visit;
    if (!visit) return false;
    if (filter === "attention") return floorPriority(visit) < 3;
    if (filter === "active") return visit.status === "open";
    if (filter === "called") return visit.staffCalled;
    if (filter === "billing") return visit.billRequested && visit.bill.due > 0;
    return visit.voiceState === "error";
  });
  return (
    <section className="space-y-4" aria-label={t("floor_list")}>
      {pending ? (
        <div
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          aria-label={t("common_loading")}
          role="status"
        >
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-64 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length ? (
        <ul className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(({ id, name, visit }) => {
            const attention = visit && floorPriority(visit) < 3;
            return (
              <li
                key={id}
                className={`min-w-0 overflow-hidden rounded-2xl border border-t-4 ${attention ? "border-border border-t-warning" : visit ? "border-border border-t-info" : "border-dashed border-border bg-surface-subtle/40"}`}
              >
                <div className="flex items-center gap-3 p-4">
                  <span
                    aria-hidden="true"
                    className={`flex size-14 shrink-0 items-center justify-center rounded-xl ${attention ? "bg-warning-soft text-warning" : visit ? "bg-info-soft text-info" : "bg-secondary text-muted-foreground"}`}
                  >
                    <Table2 className="size-8" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xl wrap-anywhere">{name}</h3>
                    <Badge variant={visit ? "info" : "inactive"}>
                      {t(visit ? "admin_open" : "admin_vacant")}
                    </Badge>
                  </div>
                </div>
                {visit ? (
                  <>
                    <div className="flex flex-wrap gap-x-4 gap-y-2 px-4 pb-4 text-sm">
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="size-4 text-muted-foreground" aria-hidden="true" />
                        {visit.guestCount} {t("admin_guests")}
                      </span>
                      <span className="inline-flex items-center gap-1.5 tabular-nums">
                        <Clock3 className="size-4 text-muted-foreground" aria-hidden="true" />
                        {m.floor_elapsed(
                          { minutes: Math.max(0, Math.floor((now - visit.openedAt) / 60_000)) },
                          { locale: uiLocale(locale) },
                        )}
                      </span>
                      <span className="text-muted-foreground">
                        <LanguageLabel locale={visit.locale} />
                      </span>
                    </div>
                    <div className="px-4 pb-4 text-sm">
                      <TableTimeLimit plan={visit.plan} now={now} detail />
                    </div>
                    {attention && (
                      <div className="flex flex-wrap gap-2 border-y border-warning/15 bg-warning-soft/50 px-4 py-3">
                        {visit.staffCalled && (
                          <Badge variant="warning">
                            <Bell />
                            {t("floor_filter_called")}
                          </Badge>
                        )}
                        {visit.billRequested && visit.bill.due > 0 && (
                          <Badge variant="warning">
                            <CircleDollarSign />
                            {t("admin_billing")}
                          </Badge>
                        )}
                        {visit.voiceState === "error" && (
                          <Badge variant="destructive">
                            <TriangleAlert />
                            {t("admin_voice_errors")}
                          </Badge>
                        )}
                      </div>
                    )}
                    <dl className="mx-4 mt-4 space-y-2 border-y border-dashed border-border py-3 text-sm tabular-nums">
                      <div className="flex justify-between gap-4">
                        <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <ReceiptText className="size-4" aria-hidden="true" />
                          {t("admin_ordered")}
                        </dt>
                        <dd>{money(visit.bill.orderedTotal, locale)}</dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-4 font-semibold">
                        <dt>{t("admin_due")}</dt>
                        <dd className="text-xl">{money(visit.bill.due, locale)}</dd>
                      </div>
                      {visit.cart.total > 0 && (
                        <div className="flex justify-between gap-4 text-muted-foreground">
                          <dt>{t("admin_cart")}</dt>
                          <dd>{money(visit.cart.total, locale)}</dd>
                        </div>
                      )}
                    </dl>
                    <div className="p-4">
                      <Button
                        variant="outline"
                        className="w-full justify-between"
                        onClick={() => onSelect(id)}
                        aria-label={`${name} ${t("floor_open_details")}`}
                      >
                        <span>{t("floor_open_details")}</span>
                        <ChevronRight />
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="px-4 pb-4">
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={!onOpen}
                      onClick={() => onOpen?.({ id, name })}
                      aria-label={`${name} ${t("admin_open_table")}`}
                    >
                      <Plus />
                      {t("admin_open_table")}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-8 text-muted-foreground">
          {t(
            search.trim()
              ? "floor_search_empty"
              : filter === "all"
                ? "admin_no_tables"
                : "floor_filter_empty",
          )}
        </p>
      )}
    </section>
  );
}
