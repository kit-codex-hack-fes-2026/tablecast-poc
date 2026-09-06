import { Badge } from "../../components/ui/badge";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import type { TableState } from "@tablecast/api/schema";
import { Bell, ChevronRight } from "lucide-react";
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
    <div className="timeline-scroll">
      <table className="timeline-table">
        <thead>
          <tr>
            <th>{t("admin_table")}</th>
            <th>{t("admin_elapsed")}</th>
            <th>{t("common_status")}</th>
            <th>{t("admin_voice")}</th>
            <th>{t("admin_locale")}</th>
            <th>{t("admin_timeline")}</th>
            <th>{t("admin_cart")}</th>
            <th>{t("admin_ordered")}</th>
            <th>{t("admin_due")}</th>
            <th>{t("admin_attention")}</th>
            <th>{t("admin_updated")}</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((table) => {
            const last = table.events.at(-1);
            const first = table.events.at(0);
            return (
              <tr key={table.id} className={table.staffCalled ? "needs-attention" : ""}>
                <td aria-label={table.tableName}>
                  <Button
                    variant="ghost"
                    type="button"
                    className="table-name-button block h-auto whitespace-normal"
                    onClick={() => onSelect(table.id)}
                  >
                    <strong>{table.tableName}</strong>
                    <span>
                      {table.guestCount} {t("admin_guests")}
                      <ChevronRight size={14} aria-hidden="true" />
                    </span>
                  </Button>
                </td>
                <td>
                  {first
                    ? `${Math.max(0, Math.floor((now - first.createdAt) / 60_000))} ${t("kiosk_minutes")}`
                    : "—"}
                </td>
                <td>
                  <Badge variant="outline" className={`status-chip ${table.status}`}>
                    {table.status === "open" ? t("admin_open") : t("admin_closed")}
                  </Badge>
                </td>
                <td>
                  <span className={`voice-chip ${table.voiceState}`}>
                    <span />
                    {table.voiceState === "active"
                      ? t("admin_active_voice")
                      : table.voiceState === "error"
                        ? t("admin_error_voice")
                        : t("admin_stopped")}
                  </span>
                </td>
                <td>
                  <span className="locale-chip">
                    {table.locale === "ja" ? "日本語" : "English"}
                  </span>
                </td>
                <td>
                  <div className="mini-timeline">
                    {table.events.slice(-10).map((event) => (
                      <span
                        key={event.cursor}
                        className={`timeline-tick ${event.kind.split(".")[0]}`}
                      >
                        <span className="timeline-tooltip">
                          <EventLabel event={event} /> · {time(event.createdAt, locale)}
                        </span>
                      </span>
                    ))}
                  </div>
                </td>
                <td>{money(table.cart.total, locale)}</td>
                <td>{money(table.bill.orderedTotal, locale)}</td>
                <td>
                  <strong>{money(table.bill.due, locale)}</strong>
                </td>
                <td>
                  {table.staffCalled ? (
                    <span className="attention-label">
                      <Bell size={16} aria-hidden="true" />
                      {t("admin_attention")}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>{last ? time(last.createdAt, locale) : "—"}</td>
              </tr>
            );
          })}
          {vacantTables.map((table) => (
            <tr key={table.id}>
              <td aria-label={table.name}>
                <Button
                  variant="ghost"
                  type="button"
                  className="table-name-button block h-auto whitespace-normal"
                  onClick={() => onOpen?.(table)}
                >
                  <strong>{table.name}</strong>
                  <span>{t("admin_open_table")}</span>
                </Button>
              </td>
              <td>—</td>
              <td>
                <Badge variant="outline" className="status-chip closed">
                  {t("admin_vacant")}
                </Badge>
              </td>
              <td>—</td>
              <td>—</td>
              <td>—</td>
              <td>{money(0, locale)}</td>
              <td>{money(0, locale)}</td>
              <td>{money(0, locale)}</td>
              <td>—</td>
              <td>—</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!tables.length && !vacantTables.length && (
        <p className="empty-note">{t("admin_no_tables")}</p>
      )}
    </div>
  );
}

function priority(table: TableState) {
  if (table.staffCalled) return 0;
  if (table.bill.due > 0 && table.events.some((event) => event.kind === "bill.requested")) return 1;
  if (table.voiceState === "error") return 2;
  return 3;
}
