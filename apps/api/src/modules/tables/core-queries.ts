import type { BatchResponse } from "drizzle-orm/batch";
import { and, desc, eq, lt, max, ne, notInArray, or, sql, sum } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import * as business from "../../db/business-schema";
import { ensure } from "../../platform/errors";
import { observeOperation } from "../../platform/telemetry";
import { catalogValue } from "../catalog/queries";
import { inactiveOrderStatuses } from "../orders/model";
import { planUsageQuery } from "../orders/queries";
import { type CoreState, type OrderPage, type OrderPageQuery } from "./model";
import { getSession, tableStateQueries, validateSession } from "./queries";
import { coreStateValue, orderValue } from "./values";

// 可変数の会員訂正statementを含む注文batchの末尾は、DB schemaを正本として検証する。
export const coreStateRowsSchema = z.tuple([
  z.array(z.object({ cursor: z.number().nullable() })),
  z.array(createSelectSchema(business.tableSessions)),
  z.array(
    z.object({
      store: createSelectSchema(business.stores).pick({
        id: true,
        name: true,
        config_version: true,
        config_json: true,
      }),
      demo: createSelectSchema(business.demoSessions)
        .pick({ session_id: true, config_version: true, config_json: true })
        .nullable(),
    }),
  ),
  z.array(z.object({ id: z.string(), name: z.string().nullable(), bill_requested: z.number() })),
  z.array(z.object({ total: z.number().nullable() })),
  z.array(
    createSelectSchema(business.payments)
      .pick({ table_session_id: true, kind: true })
      .extend({ total: z.number().nullable() }),
  ),
  z.array(createSelectSchema(business.confirmations)),
  z.array(z.object({ quantity: z.number(), lastOrderAt: z.number().nullable() })),
  z.array(z.object({ quantity: z.number() })),
  z.array(z.object({ productId: z.string() })),
]);

export function coreStateQueries(services: ApiServices, actor: Actor) {
  const { db } = services;
  ensure(actor.tableSessionId, "TABLE_REQUIRED", 403);
  // 共通のstatementを再利用し、履歴と注文snapshot全件のstatementは実行しない。
  const [, session, catalog, table, , payments, confirmation] = tableStateQueries(services, actor);
  const orderScope = and(
    eq(business.orders.table_session_id, actor.tableSessionId),
    eq(business.orders.store_id, actor.storeId),
    notInArray(business.orders.status, [...inactiveOrderStatuses]),
  );
  const lineScope = and(
    eq(business.orders.table_session_id, actor.tableSessionId),
    eq(business.orders.store_id, actor.storeId),
  );
  const lineTable = sql`json_each(${business.orders.snapshot_json},'$.lines') AS tablecast_line`;
  const productId = sql<string>`json_extract(tablecast_line.value,'$.productId')`;
  return [
    db
      .select({ cursor: max(business.tableEvents.cursor) })
      .from(business.tableEvents)
      .where(
        and(
          eq(business.tableEvents.table_session_id, actor.tableSessionId),
          eq(business.tableEvents.store_id, actor.storeId),
          ne(business.tableEvents.kind, "voice.suggestions"),
        ),
      ),
    session,
    catalog,
    table,
    db
      .select({ total: sum(business.orders.total).mapWith(Number) })
      .from(business.orders)
      .where(orderScope),
    payments,
    confirmation,
    planUsageQuery(db, actor.tableSessionId, actor.storeId),
    db
      .select({
        quantity:
          sql<number>`coalesce(sum(json_extract(tablecast_line.value,'$.quantity')),0)`.mapWith(
            Number,
          ),
      })
      .from(business.orders)
      .innerJoin(lineTable, sql`true`)
      .where(lineScope),
    db
      .select({ productId: productId.as("tablecast_product_id") })
      .from(business.orders)
      .innerJoin(lineTable, sql`true`)
      .where(lineScope)
      .groupBy(productId)
      .orderBy(desc(max(business.orders.created_at)), desc(productId))
      .limit(3),
  ] as const;
}

export async function coreStateFromRows(
  services: ApiServices,
  actor: Actor,
  [
    cursors,
    sessions,
    catalogs,
    tables,
    totals,
    payments,
    confirmations,
    usage,
    quantity,
    products,
  ]: BatchResponse<ReturnType<typeof coreStateQueries>>,
): Promise<CoreState> {
  const row = await validateSession(services, actor, sessions[0]);
  return coreStateValue(
    row,
    catalogValue(catalogs[0], actor.demoId),
    tables[0],
    {
      summary: {
        quantity: quantity[0]?.quantity ?? 0,
        productIds: products.map((product) => product.productId),
      },
      orderedTotal: totals[0]?.total ?? 0,
      orderedQuantity: usage[0]?.quantity ?? 0,
      lastOrderAt: usage[0]?.lastOrderAt ?? null,
    },
    payments,
    confirmations[0],
    cursors[0]?.cursor ?? 0,
  );
}

export function getCoreState(services: ApiServices, actor: Actor): Promise<CoreState> {
  return observeOperation(
    "tablecast.table.core",
    async () =>
      coreStateFromRows(
        services,
        actor,
        await services.db.batch(coreStateQueries(services, actor)),
      ),
    { env: services.env, input: { actor } },
  );
}

export async function getOrderPage(
  services: ApiServices,
  actor: Actor,
  query: OrderPageQuery,
): Promise<OrderPage> {
  const { db } = services;
  await getSession(services, actor);
  ensure(actor.tableSessionId, "TABLE_REQUIRED", 403);
  const [cursors, rows] = await db.batch([
    db
      .select({ cursor: max(business.tableEvents.cursor) })
      .from(business.tableEvents)
      .where(
        and(
          eq(business.tableEvents.table_session_id, actor.tableSessionId),
          eq(business.tableEvents.store_id, actor.storeId),
        ),
      ),
    db
      .select()
      .from(business.orders)
      .where(
        and(
          eq(business.orders.table_session_id, actor.tableSessionId),
          eq(business.orders.store_id, actor.storeId),
          query.beforeCreatedAt === undefined || query.beforeId === undefined
            ? undefined
            : or(
                lt(business.orders.created_at, query.beforeCreatedAt),
                and(
                  eq(business.orders.created_at, query.beforeCreatedAt),
                  lt(business.orders.id, query.beforeId),
                ),
              ),
        ),
      )
      .orderBy(desc(business.orders.created_at), desc(business.orders.id))
      .limit(query.limit + 1),
  ]);
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    orders: page.map(orderValue),
    nextCursor:
      rows.length > query.limit && last ? { createdAt: last.created_at, id: last.id } : null,
    cursor: cursors[0]?.cursor ?? 0,
  };
}

export async function getOrderStatus(services: ApiServices, actor: Actor, idempotencyKey?: string) {
  await getSession(services, actor);
  if (!idempotencyKey) return null;
  const row = await services.db
    .select()
    .from(business.orders)
    .where(
      and(
        eq(business.orders.store_id, actor.storeId),
        eq(business.orders.table_session_id, actor.tableSessionId ?? ""),
        eq(business.orders.idempotency_key, idempotencyKey),
      ),
    )
    .limit(1)
    .get();
  return row ? orderValue(row) : null;
}
