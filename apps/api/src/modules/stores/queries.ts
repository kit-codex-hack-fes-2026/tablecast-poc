import { and, desc, eq, inArray, sql } from "drizzle-orm";
import * as business from "../../db/business-schema";
import type { EventRecord } from "../../db/records";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import { getCatalog } from "../catalog/queries";
import type { TableEvent } from "../tables/model";
import { eventValue, tableStateValue } from "../tables/queries";
import type { AdminState } from "./model";
export async function getAdminState(services: ApiServices, actor: Actor): Promise<AdminState> {
  const db = services.db;
  // 読取batchより先のcursorを使い、取得中の更新をリアルタイム経路で回復する。
  const cursor = await db
    .select({ cursor: sql<number>`coalesce(max(${business.tableEvents.cursor}),0)` })
    .from(business.tableEvents)
    .where(eq(business.tableEvents.store_id, actor.storeId))
    .get();
  const store = await getCatalog(services, actor.storeId);
  const active = db
    .select({ id: business.tableSessions.id })
    .from(business.tableSessions)
    .where(
      and(
        eq(business.tableSessions.store_id, actor.storeId),
        eq(business.tableSessions.status, "open"),
      ),
    );
  const [sessions, restaurantTables, orderRows, paymentRows, confirmations, history, events] =
    await db.batch([
      db
        .select()
        .from(business.tableSessions)
        .where(
          and(
            eq(business.tableSessions.store_id, actor.storeId),
            eq(business.tableSessions.status, "open"),
          ),
        )
        .orderBy(business.tableSessions.table_id),
      db
        .select({
          id: business.restaurantTables.id,
          name: business.restaurantTables.name,
          bill_requested: sql<number>`EXISTS(SELECT 1 FROM table_events e JOIN table_sessions s ON s.id=e.table_session_id AND s.store_id=e.store_id WHERE e.store_id=${actor.storeId} AND s.table_id=restaurant_tables.id AND s.status='open' AND e.kind='bill.requested')`,
        })
        .from(business.restaurantTables)
        .where(eq(business.restaurantTables.store_id, actor.storeId))
        .orderBy(business.restaurantTables.name),
      db
        .select()
        .from(business.orders)
        .where(
          and(
            eq(business.orders.store_id, actor.storeId),
            inArray(business.orders.table_session_id, active),
          ),
        )
        .orderBy(business.orders.created_at),
      db
        .select({
          table_session_id: business.payments.table_session_id,
          kind: business.payments.kind,
          total: sql<number>`coalesce(sum(${business.payments.amount}),0)`,
        })
        .from(business.payments)
        .where(
          and(
            eq(business.payments.store_id, actor.storeId),
            inArray(business.payments.table_session_id, active),
          ),
        )
        .groupBy(business.payments.table_session_id, business.payments.kind),
      db
        .select()
        .from(business.confirmations)
        .where(
          and(
            eq(business.confirmations.store_id, actor.storeId),
            inArray(business.confirmations.table_session_id, active),
            sql`status IN ('pending','read') AND expires_at>${Date.now()}`,
          ),
        )
        .orderBy(desc(business.confirmations.created_at)),
      db
        .select()
        .from(business.tableEvents)
        .where(
          sql`store_id=${actor.storeId} AND cursor IN (SELECT cursor FROM (SELECT cursor,row_number() OVER (PARTITION BY table_session_id ORDER BY cursor DESC) AS position FROM table_events WHERE store_id=${actor.storeId} AND table_session_id IN (${active})) WHERE position<=100)`,
        )
        .orderBy(business.tableEvents.cursor),
      db
        .select()
        .from(business.tableEvents)
        .where(eq(business.tableEvents.store_id, actor.storeId))
        .orderBy(desc(business.tableEvents.cursor))
        .limit(100),
    ]);
  const tablesById = new Map(restaurantTables.map((table) => [table.id, table]));
  const occupied = new Set(sessions.map((session) => session.table_id));
  const ordersBySession = Map.groupBy(orderRows, (order) => order.table_session_id);
  const paymentsBySession = Map.groupBy(paymentRows, (payment) => payment.table_session_id);
  const confirmationsBySession = Map.groupBy(
    confirmations,
    (confirmation) => confirmation.table_session_id,
  );
  const historyBySession = Map.groupBy(history, (event) => event.table_session_id);
  return {
    store: { id: store.storeId, name: store.storeName, role: actor.role ?? "member" },
    tables: sessions.map((session) =>
      tableStateValue(
        session,
        store,
        tablesById.get(session.table_id),
        ordersBySession.get(session.id) ?? [],
        paymentsBySession.get(session.id) ?? [],
        confirmationsBySession.get(session.id)?.[0],
        historyBySession.get(session.id) ?? [],
      ),
    ),
    vacantTables: restaurantTables
      .filter((table) => !occupied.has(table.id))
      .map(({ id, name }) => ({ id, name })),
    events: events.toReversed().map(eventValue),
    cursor: cursor?.cursor ?? 0,
  };
}

export async function getEvents(
  services: ApiServices,
  actor: Actor,
  after = 0,
): Promise<{ events: TableEvent[]; cursor: number }> {
  const db = services.db;

  const rows = actor.tableSessionId
    ? await db.all<EventRecord>(
        sql`SELECT * FROM table_events WHERE store_id=${actor.storeId} AND (table_session_id=${actor.tableSessionId} OR (table_session_id IS NULL AND kind='configuration.published')) AND cursor>${after} ORDER BY cursor LIMIT 500`,
      )
    : await db.all<EventRecord>(
        sql`SELECT * FROM table_events WHERE store_id=${actor.storeId} AND cursor>${after} ORDER BY cursor LIMIT 500`,
      );
  return {
    events: rows.map((row) => {
      const event = eventValue(row);
      // 卓へは設定更新の通知だけを渡し、公開者や下書きの情報を渡さない。
      if (actor.tableSessionId && row.table_session_id === null) event.data = {};
      return event;
    }),
    cursor: rows.at(-1)?.cursor ?? after,
  };
}

export async function listMemberStores(services: ApiServices, userId: string) {
  const { db } = services;
  const rows = await db.all<{
    id: string;
    name: string;
    logo: string | null;
    role: string;
    organizationId: string;
  }>(
    sql`SELECT s.id,s.name,o.logo,m.role,s.organization_id AS organizationId FROM stores s JOIN organization o ON o.id=s.organization_id JOIN member m ON m.organization_id=s.organization_id WHERE m.user_id=${userId} ORDER BY s.name`,
  );

  return rows;
}
