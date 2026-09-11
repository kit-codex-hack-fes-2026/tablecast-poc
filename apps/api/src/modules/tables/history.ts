import { sql } from "drizzle-orm";
import type { EventRecord } from "../../db/records";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import type { Locale } from "../../platform/model";
import type { Actor } from "../auth/model";
import {
  tablePlanSchema,
  type HistoryPage,
  type HistoryQuery,
  type SessionEventsPage,
  type SessionEventsQuery,
} from "./model";
import { billValue, eventValue, getSession } from "./queries";
export async function getHistory(
  services: ApiServices,
  actor: Actor,
  query: HistoryQuery,
): Promise<HistoryPage> {
  const db = services.db;

  ensure(actor.kind === "staff", "STAFF_REQUIRED", 403);
  const cursor =
    query.beforeClosedAt !== undefined && query.beforeId !== undefined
      ? sql` AND (s.closed_at,s.id)<(${query.beforeClosedAt},${query.beforeId})`
      : sql``;
  const rows = await db.all<{
    id: string;
    table_id: string;
    table_name: string;
    locale: Locale;
    guest_count: number;
    opened_at: number;
    closed_at: number;
    plan_json: string | null;
    ordered_total: number;
    adjustment_total: number;
    paid_total: number;
  }>(sql`WITH page AS (
      SELECT s.id,s.store_id,s.table_id,t.name AS table_name,s.locale,s.guest_count,s.opened_at,s.closed_at,s.plan_json
      FROM table_sessions s JOIN restaurant_tables t ON t.id=s.table_id AND t.store_id=s.store_id
      WHERE s.store_id=${actor.storeId} AND s.kind='table' AND s.status='closed' AND s.closed_at IS NOT NULL${cursor}
      ORDER BY s.closed_at DESC,s.id DESC LIMIT ${query.limit + 1}
    )
    SELECT page.*,
      (SELECT COALESCE(SUM(o.total),0) FROM orders o WHERE o.table_session_id=page.id AND o.store_id=page.store_id AND o.status NOT IN ('cancelled','rejected')) AS ordered_total,
      (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.table_session_id=page.id AND p.store_id=page.store_id AND p.kind='adjustment') AS adjustment_total,
      (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.table_session_id=page.id AND p.store_id=page.store_id AND p.kind='payment') AS paid_total
    FROM page
    ORDER BY page.closed_at DESC,page.id DESC`);
  const sessions = rows.slice(0, query.limit).map((row) => ({
    id: row.id,
    tableId: row.table_id,
    tableName: row.table_name,
    locale: row.locale,
    guestCount: row.guest_count,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    bill: billValue(
      {
        orderedTotal: row.ordered_total,
        adjustmentTotal: row.adjustment_total,
        paidTotal: row.paid_total,
        cartTotal: 0,
      },
      row.plan_json ? tablePlanSchema.parse(JSON.parse(row.plan_json)) : null,
      row.guest_count,
    ),
  }));
  const last = sessions.at(-1);
  return {
    sessions,
    nextCursor: rows.length > query.limit && last ? { closedAt: last.closedAt, id: last.id } : null,
  };
}

export async function getSessionEvents(
  services: ApiServices,
  actor: Actor,
  query: SessionEventsQuery,
): Promise<SessionEventsPage> {
  const db = services.db;

  ensure(actor.kind === "staff", "STAFF_REQUIRED", 403);
  const row = await getSession(services, actor);
  const cursor = query.before === undefined ? sql`` : sql` AND cursor<${query.before}`;
  const rows = await db.all<EventRecord>(
    sql`SELECT * FROM table_events WHERE table_session_id=${row.id} AND store_id=${actor.storeId}${cursor} ORDER BY cursor DESC LIMIT ${query.limit + 1}`,
  );
  const events = rows.slice(0, query.limit).toReversed().map(eventValue);
  return {
    events,
    nextBefore: rows.length > query.limit ? (events[0]?.cursor ?? null) : null,
  };
}
