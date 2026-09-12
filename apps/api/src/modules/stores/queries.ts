import { and, desc, eq, exists, gt, inArray, isNull, max, or, sql, sum } from "drizzle-orm";
import * as business from "../../db/business-schema";
import { member, organization } from "../../db/auth-schema";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import { catalogQuery, catalogValue } from "../catalog/queries";
import type { TableEvent } from "../tables/model";
import { eventValue, tableStateValue } from "../tables/queries";
import type { AdminState } from "./model";
export async function getAdminState(services: ApiServices, actor: Actor): Promise<AdminState> {
  const db = services.db;
  const storeEvents = and(
    eq(business.tableEvents.store_id, actor.storeId),
    or(
      isNull(business.tableEvents.table_session_id),
      inArray(
        business.tableEvents.table_session_id,
        db
          .select({ id: business.tableSessions.id })
          .from(business.tableSessions)
          .where(
            and(
              eq(business.tableSessions.store_id, actor.storeId),
              eq(business.tableSessions.kind, "table"),
            ),
          ),
      ),
    ),
  );
  const active = db
    .select({ id: business.tableSessions.id })
    .from(business.tableSessions)
    .where(
      and(
        eq(business.tableSessions.store_id, actor.storeId),
        eq(business.tableSessions.status, "open"),
        eq(business.tableSessions.kind, "table"),
      ),
    );
  const [
    cursors,
    catalogs,
    sessions,
    restaurantTables,
    orderRows,
    paymentRows,
    confirmations,
    history,
    events,
  ] = await db.batch([
    // 状態より先のcursorで取得中の更新を回復する。batch内の順序を維持する。
    db
      .select({ cursor: max(business.tableEvents.cursor) })
      .from(business.tableEvents)
      .where(storeEvents),
    catalogQuery(db, actor.storeId),
    db
      .select()
      .from(business.tableSessions)
      .where(
        and(
          eq(business.tableSessions.store_id, actor.storeId),
          eq(business.tableSessions.status, "open"),
          eq(business.tableSessions.kind, "table"),
        ),
      )
      .orderBy(business.tableSessions.table_id),
    db
      .select({
        id: business.restaurantTables.id,
        name: business.restaurantTables.name,
        bill_requested: exists(
          db
            .select({ cursor: business.tableEvents.cursor })
            .from(business.tableEvents)
            .innerJoin(
              business.tableSessions,
              and(
                eq(business.tableSessions.id, business.tableEvents.table_session_id),
                eq(business.tableSessions.store_id, business.tableEvents.store_id),
              ),
            )
            .where(
              and(
                eq(business.tableEvents.store_id, actor.storeId),
                eq(business.tableSessions.table_id, business.restaurantTables.id),
                eq(business.tableSessions.status, "open"),
                eq(business.tableEvents.kind, "bill.requested"),
              ),
            ),
        ).mapWith(Number),
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
        total: sum(business.payments.amount).mapWith(Number),
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
          inArray(business.confirmations.status, ["pending", "read"]),
          gt(business.confirmations.expires_at, Date.now()),
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
      .where(storeEvents)
      .orderBy(desc(business.tableEvents.cursor))
      .limit(100),
  ]);
  const store = catalogValue(catalogs[0]);
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
        tablesById.get(session.table_id ?? ""),
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
    cursor: cursors[0]?.cursor ?? 0,
  };
}

export async function getEvents(
  services: ApiServices,
  actor: Actor,
  after = 0,
): Promise<{ events: TableEvent[]; cursor: number }> {
  const db = services.db;

  const scope = actor.tableSessionId
    ? or(
        eq(business.tableEvents.table_session_id, actor.tableSessionId),
        actor.demoId
          ? undefined
          : and(
              isNull(business.tableEvents.table_session_id),
              eq(business.tableEvents.kind, "configuration.published"),
            ),
      )
    : or(
        isNull(business.tableEvents.table_session_id),
        inArray(
          business.tableEvents.table_session_id,
          db
            .select({ id: business.tableSessions.id })
            .from(business.tableSessions)
            .where(
              and(
                eq(business.tableSessions.store_id, actor.storeId),
                eq(business.tableSessions.kind, "table"),
              ),
            ),
        ),
      );
  const rows = await db
    .select()
    .from(business.tableEvents)
    .where(
      and(
        eq(business.tableEvents.store_id, actor.storeId),
        scope,
        gt(business.tableEvents.cursor, after),
      ),
    )
    .orderBy(business.tableEvents.cursor)
    .limit(500);
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
  return db
    .select({
      id: business.stores.id,
      name: business.stores.name,
      logo: organization.logo,
      role: member.role,
      organizationId: business.stores.organization_id,
    })
    .from(business.stores)
    .innerJoin(organization, eq(organization.id, business.stores.organization_id))
    .innerJoin(member, eq(member.organizationId, business.stores.organization_id))
    .where(eq(member.userId, userId))
    .orderBy(business.stores.name);
}
