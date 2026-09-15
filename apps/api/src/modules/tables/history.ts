import {
  and,
  desc,
  eq,
  gt,
  gte,
  isNull,
  isNotNull,
  lt,
  lte,
  notInArray,
  or,
  sql,
  sum,
} from "drizzle-orm";
import {
  orders,
  payments,
  restaurantTables,
  tableEvents,
  tableSessions,
} from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import type { Actor } from "../auth/model";
import {
  tablePlanSchema,
  type HistoryPage,
  type HistoryQuery,
  type SessionEventsPage,
  type SessionEventsQuery,
  storeTimeZone,
  timelineSessionSchema,
  type TimelinePage,
  type TimelineQuery,
} from "./model";
import { billValue, eventValue, getSession } from "./queries";

export async function getTimeline(
  services: ApiServices,
  actor: Actor,
  query: TimelineQuery,
): Promise<TimelinePage> {
  ensure(actor.kind === "staff", "STAFF_REQUIRED", 403);
  const startAt = Date.parse(`${query.date}T00:00:00+09:00`);
  const endAt = startAt + 86_400_000;
  const observedAt = Date.now();
  const cursor =
    query.beforeOpenedAt !== undefined && query.beforeId !== undefined
      ? or(
          lt(tableSessions.opened_at, query.beforeOpenedAt),
          and(
            eq(tableSessions.opened_at, query.beforeOpenedAt),
            lt(tableSessions.id, query.beforeId),
          ),
        )
      : undefined;
  const db = services.db;
  const fields = {
    id: tableSessions.id,
    tableId: tableSessions.table_id,
    guestCount: tableSessions.guest_count,
    status: tableSessions.status,
    openedAt: tableSessions.opened_at,
    closedAt: tableSessions.closed_at,
  };
  const scope = and(
    eq(tableSessions.store_id, actor.storeId),
    eq(tableSessions.kind, "table"),
    lt(tableSessions.opened_at, endAt),
    cursor,
  );
  // 閉卓日時の下限をindexへ渡し、空の日でも古い閉卓履歴を走査しない。
  const closed = db
    .select(fields)
    .from(tableSessions)
    .where(
      and(
        scope,
        eq(tableSessions.status, "closed"),
        gte(tableSessions.closed_at, startAt),
        or(
          gt(tableSessions.closed_at, startAt),
          eq(tableSessions.closed_at, tableSessions.opened_at),
        ),
      ),
    );
  const open = db
    .select(fields)
    .from(tableSessions)
    .where(and(scope, eq(tableSessions.status, "open"), lte(tableSessions.opened_at, observedAt)));
  // UNION ALLの後に同じ不変cursor順で絞る。未来日に利用中を延ばさない。
  const visits = (observedAt >= startAt ? closed.unionAll(open) : closed).as("visits");
  const [rows, invalid] = await db.batch([
    db
      .select()
      .from(visits)
      .orderBy(desc(visits.openedAt), desc(visits.id))
      .limit(query.limit + 1),
    // 不正な終了時刻は専用のpartial indexで検出し、来店なしへ置き換えない。
    db
      .select({ id: tableSessions.id })
      .from(tableSessions)
      .where(
        and(
          scope,
          eq(tableSessions.status, "closed"),
          or(isNull(tableSessions.closed_at), lt(tableSessions.closed_at, tableSessions.opened_at)),
        ),
      )
      .limit(1),
  ]);
  ensure(invalid.length === 0, "TIMELINE_INVALID_SESSION", 409);
  const parsed = timelineSessionSchema.array().safeParse(rows);
  ensure(parsed.success, "TIMELINE_INVALID_SESSION", 409);
  const sessions = parsed.data.slice(0, query.limit);
  const last = sessions.at(-1);
  return {
    date: query.date,
    timeZone: storeTimeZone,
    startAt,
    endAt,
    observedAt,
    sessions,
    nextCursor: rows.length > query.limit && last ? { openedAt: last.openedAt, id: last.id } : null,
  };
}

export async function getHistory(
  services: ApiServices,
  actor: Actor,
  query: HistoryQuery,
): Promise<HistoryPage> {
  const db = services.db;

  ensure(actor.kind === "staff", "STAFF_REQUIRED", 403);
  const cursor =
    query.beforeClosedAt !== undefined && query.beforeId !== undefined
      ? sql`(${tableSessions.closed_at},${tableSessions.id}) < (${query.beforeClosedAt},${query.beforeId})`
      : undefined;
  const page = db.$with("page").as(
    db
      .select({
        id: tableSessions.id,
        store_id: tableSessions.store_id,
        table_id: sql<string>`${restaurantTables.id}`.as("table_id"),
        table_name: restaurantTables.name,
        locale: tableSessions.locale,
        guest_count: tableSessions.guest_count,
        opened_at: tableSessions.opened_at,
        closed_at: tableSessions.closed_at,
        plan_json: tableSessions.plan_json,
      })
      .from(tableSessions)
      .innerJoin(
        restaurantTables,
        and(
          eq(restaurantTables.id, tableSessions.table_id),
          eq(restaurantTables.store_id, tableSessions.store_id),
        ),
      )
      .where(
        and(
          eq(tableSessions.store_id, actor.storeId),
          eq(tableSessions.kind, "table"),
          eq(tableSessions.status, "closed"),
          isNotNull(tableSessions.closed_at),
          cursor,
        ),
      )
      .orderBy(desc(tableSessions.closed_at), desc(tableSessions.id))
      .limit(query.limit + 1),
  );
  const orderedTotal = db
    .select({ total: sum(orders.total) })
    .from(orders)
    .where(
      and(
        eq(orders.table_session_id, page.id),
        eq(orders.store_id, page.store_id),
        notInArray(orders.status, ["cancelled", "rejected"]),
      ),
    );
  const adjustmentTotal = db
    .select({ total: sum(payments.amount) })
    .from(payments)
    .where(
      and(
        eq(payments.table_session_id, page.id),
        eq(payments.store_id, page.store_id),
        eq(payments.kind, "adjustment"),
      ),
    );
  const paidTotal = db
    .select({ total: sum(payments.amount) })
    .from(payments)
    .where(
      and(
        eq(payments.table_session_id, page.id),
        eq(payments.store_id, page.store_id),
        eq(payments.kind, "payment"),
      ),
    );
  const rows = await db
    .with(page)
    .select({
      id: page.id,
      table_id: page.table_id,
      table_name: page.table_name,
      locale: page.locale,
      guest_count: page.guest_count,
      opened_at: page.opened_at,
      closed_at: page.closed_at,
      plan_json: page.plan_json,
      ordered_total: sql<number | null>`(${orderedTotal})`.mapWith(Number),
      adjustment_total: sql<number | null>`(${adjustmentTotal})`.mapWith(Number),
      paid_total: sql<number | null>`(${paidTotal})`.mapWith(Number),
    })
    .from(page)
    .orderBy(desc(page.closed_at), desc(page.id));
  const sessions = rows.slice(0, query.limit).map((row) => {
    ensure(row.closed_at !== null, "SESSION_NOT_CLOSED", 409);
    return {
      id: row.id,
      tableId: row.table_id,
      tableName: row.table_name,
      locale: row.locale,
      guestCount: row.guest_count,
      openedAt: row.opened_at,
      closedAt: row.closed_at,
      bill: billValue(
        {
          orderedTotal: row.ordered_total ?? 0,
          adjustmentTotal: row.adjustment_total ?? 0,
          paidTotal: row.paid_total ?? 0,
          cartTotal: 0,
        },
        row.plan_json ? tablePlanSchema.parse(JSON.parse(row.plan_json)) : null,
        row.guest_count,
      ),
    };
  });
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
  const rows = await db
    .select()
    .from(tableEvents)
    .where(
      and(
        eq(tableEvents.table_session_id, row.id),
        eq(tableEvents.store_id, actor.storeId),
        query.before === undefined ? undefined : lt(tableEvents.cursor, query.before),
      ),
    )
    .orderBy(desc(tableEvents.cursor))
    .limit(query.limit + 1);
  const events = rows.slice(0, query.limit).toReversed().map(eventValue);
  return {
    events,
    nextBefore: rows.length > query.limit ? (events[0]?.cursor ?? null) : null,
  };
}
