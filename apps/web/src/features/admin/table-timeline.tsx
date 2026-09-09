import type { TableState } from "@tablecast/api/schema";
import { Bell, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Table, TableCell, TableHead } from "../../components/ui/table";
import { money, time, useI18n } from "../../i18n/locale";
import { EventLabel } from "./events";

export function TableTimeline({
  tables,
  vacantTables = [],
  onSelect,
  onOpen,
}: {
  tables: TableState[];
  vacantTables?: { id: string; name: string }[];
  onSelect: (id: string) => void;
  onOpen?: (table: { id: string; name: string }) => void;
}) {
  const { locale, t } = useI18n();
  const [initialOrder] = useState(
    () =>
      new Map(
        [...tables]
          .sort((a, b) => priority(a) - priority(b) || a.tableName.localeCompare(b.tableName))
          .map((table, index) => [table.id, index]),
      ),
  );
  const ordered = [...tables].sort(
    (a, b) =>
      (initialOrder.get(a.id) ?? Infinity) - (initialOrder.get(b.id) ?? Infinity) ||
      a.tableName.localeCompare(b.tableName),
  );
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="overflow-x-auto">
      <Table className="border-collapse text-left w-full whitespace-nowrap [&_th:first-child]:pl-5 [&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:bg-card [&_th:first-child]:z-1 [&_th:first-child]:border-r [&_th:first-child]:border-r-border [&_td:first-child]:pl-5 [&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:bg-card [&_td:first-child]:z-1 [&_td:first-child]:border-r [&_td:first-child]:border-r-border [&_tr:last-child_td]:border-b-0 [&_.needs-attention]:bg-accent-soft [&_.needs-attention_td:first-child]:bg-accent-soft">
        <thead>
          <tr>
            <TableHead>{t("admin_table")}</TableHead>
            <TableHead>{t("admin_elapsed")}</TableHead>
            <TableHead>{t("common_status")}</TableHead>
            <TableHead>{t("admin_voice")}</TableHead>
            <TableHead>{t("admin_locale")}</TableHead>
            <TableHead>{t("admin_timeline")}</TableHead>
            <TableHead>{t("admin_cart")}</TableHead>
            <TableHead>{t("admin_ordered")}</TableHead>
            <TableHead>{t("admin_due")}</TableHead>
            <TableHead>{t("admin_attention")}</TableHead>
            <TableHead>{t("admin_updated")}</TableHead>
          </tr>
        </thead>
        <tbody>
          {ordered.map((table) => {
            const last = table.events.at(-1);
            return (
              <tr key={table.id} className={table.staffCalled ? "needs-attention" : ""}>
                <TableCell aria-label={table.tableName}>
                  <Button
                    variant="ghost"
                    type="button"
                    className="text-left p-0 min-h-12 min-w-20 block h-auto whitespace-normal"
                    onClick={() => onSelect(table.id)}
                  >
                    <strong className="block text-lg font-semibold">{table.tableName}</strong>
                    <span className="flex items-center gap-2.5 mt-1 text-muted-foreground text-sm">
                      {table.guestCount} {t("admin_guests")}
                      <ChevronRight size={14} aria-hidden="true" />
                    </span>
                  </Button>
                </TableCell>
                <TableCell>
                  {Math.max(0, Math.floor((now - table.openedAt) / 60_000))} {t("kiosk_minutes")}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    data-state={table.status}
                    className="inline-flex items-center border border-border rounded-2xl py-1 px-2 text-sm text-success bg-success-soft [&[data-state=closed]]:text-muted-foreground [&[data-state=closed]]:bg-surface-subtle [&[data-state=closed]]:border-border"
                  >
                    {table.status === "open" ? t("admin_open") : t("admin_closed")}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span
                    data-state={table.voiceState}
                    className="inline-flex items-center gap-1 text-muted-foreground text-sm [&_>_span]:w-1 [&_>_span]:h-1 [&_>_span]:rounded-full [&_>_span]:bg-muted [&[data-state=active]_>_span]:bg-success [&[data-state=error]_>_span]:bg-accent"
                  >
                    <span />
                    {table.voiceState === "active"
                      ? t("admin_active_voice")
                      : table.voiceState === "error"
                        ? t("admin_error_voice")
                        : t("admin_stopped")}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {table.locale === "ja" ? "日本語" : "English"}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="relative flex items-center gap-1 w-32 h-5 border-b border-b-border">
                    {table.events.slice(-10).map((event) => (
                      <span
                        key={event.cursor}
                        data-state={event.kind.split(".")[0]}
                        className="w-1.5 h-4 rounded-sm bg-muted relative [&[data-state=order]]:bg-success [&[data-state=order]]:h-5 [&[data-state=staff]]:bg-accent [&[data-state=staff]]:h-6 [&[data-state=billing]]:bg-accent [&[data-state=billing]]:h-6 [&[data-state=bill]]:bg-accent [&[data-state=bill]]:h-6 [&:hover_.timeline-tooltip]:block"
                      >
                        <span className="timeline-tooltip hidden absolute left-0 bottom-full p-1 bg-foreground text-card rounded-sm z-2 text-sm">
                          <EventLabel event={event} /> · {time(event.createdAt, locale)}
                        </span>
                      </span>
                    ))}
                  </div>
                </TableCell>
                <TableCell>{money(table.cart.total, locale)}</TableCell>
                <TableCell>{money(table.bill.orderedTotal, locale)}</TableCell>
                <TableCell>
                  <strong>{money(table.bill.due, locale)}</strong>
                </TableCell>
                <TableCell>
                  {table.staffCalled ? (
                    <span className="flex items-center gap-1 text-accent-foreground text-sm">
                      <Bell size={16} aria-hidden="true" />
                      {t("admin_attention")}
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>{last ? time(last.createdAt, locale) : "—"}</TableCell>
              </tr>
            );
          })}
          {vacantTables.map((table) => (
            <tr key={table.id}>
              <TableCell aria-label={table.name}>
                <Button
                  variant="ghost"
                  type="button"
                  className="text-left p-0 min-h-12 min-w-20 block h-auto whitespace-normal"
                  onClick={() => onOpen?.(table)}
                >
                  <strong className="block text-lg font-semibold">{table.name}</strong>
                  <span className="flex items-center gap-2.5 mt-1 text-muted-foreground text-sm">
                    {t("admin_open_table")}
                  </span>
                </Button>
              </TableCell>
              <TableCell>—</TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className="inline-flex items-center border border-border rounded-2xl py-1 px-2 text-sm text-success bg-success-soft [&.closed]:text-muted-foreground [&.closed]:bg-surface-subtle [&.closed]:border-border closed"
                >
                  {t("admin_vacant")}
                </Badge>
              </TableCell>
              <TableCell>—</TableCell>
              <TableCell>—</TableCell>
              <TableCell>—</TableCell>
              <TableCell>{money(0, locale)}</TableCell>
              <TableCell>{money(0, locale)}</TableCell>
              <TableCell>{money(0, locale)}</TableCell>
              <TableCell>—</TableCell>
              <TableCell>—</TableCell>
            </tr>
          ))}
        </tbody>
      </Table>
      {!tables.length && !vacantTables.length && (
        <p className="py-12 px-6 text-muted-foreground text-center">{t("admin_no_tables")}</p>
      )}
    </div>
  );
}

function priority(table: TableState) {
  if (table.staffCalled) return 0;
  if (table.billRequested && table.bill.due > 0) return 1;
  if (table.voiceState === "error") return 2;
  return 3;
}
