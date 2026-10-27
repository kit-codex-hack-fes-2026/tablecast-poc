import type { BatchResponse } from "drizzle-orm/batch";
import { and, desc, eq, exists, gt, inArray, ne, sum as sumAmount } from "drizzle-orm";
import type { TableRecord } from "../../db/records";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import type { Catalog } from "../configuration/model";
import * as business from "../../db/business-schema";
import { ensure } from "../../platform/errors";
import { observeOperation } from "../../platform/telemetry";
import { type PlanContext } from "../catalog/pricing";
import { catalogQuery, catalogValue, getCatalog } from "../catalog/queries";
import { configurationSchema } from "../configuration/model";
import { getDemoRecord } from "../demo/queries";
import { type TableState } from "./model";
import { planFromOrders, tableStateValue } from "./values";

export async function getTableState(services: ApiServices, actor: Actor): Promise<TableState> {
  return observeOperation(
    "tablecast.table.read",
    async () =>
      tableStateFromRows(
        services,
        actor,
        await services.db.batch(tableStateQueries(services, actor)),
      ),
    { env: services.env, input: { actor } },
  );
}

/** 更新batchにも後置できる状態読取。cursorを先に読み、取得中の更新を既読にしない。 */
export function tableStateQueries(services: ApiServices, actor: Actor) {
  const db = services.db;
  ensure(actor.tableSessionId, "TABLE_REQUIRED", 403);
  const sessionId = actor.tableSessionId;
  return [
    db
      .select()
      .from(business.tableEvents)
      .where(
        and(
          eq(business.tableEvents.table_session_id, sessionId),
          ne(business.tableEvents.kind, "voice.suggestions"),
          eq(business.tableEvents.store_id, actor.storeId),
        ),
      )
      .orderBy(desc(business.tableEvents.cursor))
      .limit(100),
    db
      .select()
      .from(business.tableSessions)
      .where(
        and(
          eq(business.tableSessions.id, sessionId),
          eq(business.tableSessions.store_id, actor.storeId),
        ),
      ),
    catalogQuery(db, actor.storeId, actor.demoId),
    db
      .select({
        id: business.tableSessions.id,
        name: business.restaurantTables.name,
        bill_requested: exists(
          db
            .select({ cursor: business.tableEvents.cursor })
            .from(business.tableEvents)
            .where(
              and(
                eq(business.tableEvents.store_id, actor.storeId),
                eq(business.tableEvents.table_session_id, sessionId),
                eq(business.tableEvents.kind, "bill.requested"),
              ),
            ),
        ).mapWith(Number),
      })
      .from(business.tableSessions)
      .leftJoin(
        business.restaurantTables,
        eq(business.restaurantTables.id, business.tableSessions.table_id),
      )
      .where(
        and(
          eq(business.tableSessions.id, sessionId),
          eq(business.tableSessions.store_id, actor.storeId),
        ),
      ),
    db
      .select()
      .from(business.orders)
      .where(
        and(
          eq(business.orders.table_session_id, sessionId),
          eq(business.orders.store_id, actor.storeId),
        ),
      )
      .orderBy(business.orders.created_at),
    db
      .select({
        table_session_id: business.payments.table_session_id,
        kind: business.payments.kind,
        total: sumAmount(business.payments.amount).mapWith(Number),
      })
      .from(business.payments)
      .where(
        and(
          eq(business.payments.table_session_id, sessionId),
          eq(business.payments.store_id, actor.storeId),
        ),
      )
      .groupBy(business.payments.table_session_id, business.payments.kind),
    db
      .select()
      .from(business.confirmations)
      .where(
        and(
          eq(business.confirmations.table_session_id, sessionId),
          eq(business.confirmations.store_id, actor.storeId),
          inArray(business.confirmations.status, ["pending", "read"]),
          gt(business.confirmations.expires_at, Date.now()),
        ),
      )
      .orderBy(desc(business.confirmations.created_at))
      .limit(1),
  ] as const;
}

export async function tableStateFromRows(
  services: ApiServices,
  actor: Actor,
  [history, sessions, catalogs, tables, orderRows, paymentRows, confirmations]: BatchResponse<
    ReturnType<typeof tableStateQueries>
  >,
): Promise<TableState> {
  const row = await validateSession(services, actor, sessions[0]);
  const catalog = catalogValue(catalogs[0], actor.demoId);
  return tableStateValue(
    row,
    catalog,
    tables[0],
    orderRows,
    paymentRows,
    confirmations[0],
    history.toReversed(),
  );
}

export async function getSession(services: ApiServices, actor: Actor): Promise<TableRecord> {
  const db = services.db;

  ensure(actor.tableSessionId, "TABLE_REQUIRED", 403);
  const authorised = services.tableAccess.session;
  services.tableAccess.session = undefined;
  if (authorised?.id === actor.tableSessionId && authorised.store_id === actor.storeId)
    return validateSession(services, actor, authorised);
  const row = await db
    .select()
    .from(business.tableSessions)
    .where(
      and(
        eq(business.tableSessions.id, actor.tableSessionId),
        eq(business.tableSessions.store_id, actor.storeId),
      ),
    )
    .get();
  return validateSession(services, actor, row);
}

export async function validateSession(
  services: ApiServices,
  actor: Actor,
  row: TableRecord | undefined,
): Promise<TableRecord> {
  ensure(row, "TABLE_NOT_FOUND", 404);
  if (row.kind === "demo") {
    const access = services.tableAccess.demo;
    if (
      !access ||
      access.id !== actor.demoId ||
      access.id !== row.id ||
      access.storeId !== actor.storeId ||
      access.userId !== actor.userId ||
      access.voiceSessionId !== actor.voiceSessionId
    )
      await getDemoRecord(services, actor);
  } else ensure(!actor.demoId, "DEMO_NOT_FOUND", 404);
  if (actor.kind === "device") ensure(row.status === "open", "SESSION_CLOSED", 403);
  if (actor.kind === "voice")
    ensure(
      row.status === "open" &&
        row.voice_state === "active" &&
        row.voice_session_id === actor.voiceSessionId &&
        (!actor.turnId || row.active_turn_id === actor.turnId),
      "VOICE_SESSION_STALE",
      409,
    );
  return row;
}

export async function getPricingContext(
  services: ApiServices,
  row: TableRecord,
): Promise<{ catalog: Catalog; plan: null | PlanContext }> {
  const demoId = row.kind === "demo" ? row.id : undefined;
  const access = services.tableAccess.demo;
  const authorised =
    access && access.id === demoId && access.storeId === row.store_id ? access : undefined;
  if (!row.plan_json && authorised)
    return {
      catalog: {
        storeId: row.store_id,
        storeName: authorised.configuration.storeName,
        version: authorised.configuration.config_version,
        configuration: configurationSchema.parse(JSON.parse(authorised.configuration.config_json)),
      },
      plan: null,
    };
  if (!row.plan_json)
    return { catalog: await getCatalog(services, row.store_id, demoId), plan: null };
  const db = services.db;
  const [catalogs, orders] = await db.batch([
    catalogQuery(db, row.store_id, demoId),
    db
      .select()
      .from(business.orders)
      .where(
        and(
          eq(business.orders.table_session_id, row.id),
          eq(business.orders.store_id, row.store_id),
        ),
      ),
  ]);
  return { catalog: catalogValue(catalogs[0], demoId), plan: planFromOrders(row, orders) };
}
