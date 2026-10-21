import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import type { ApiServices } from "../../platform/context";
import { customerConsumption } from "../../db/customer-schema";
import { orders } from "../../db/table-schema";
import { snapshotSchema } from "../orders/model";

export function customerOrderRows(
  services: ApiServices,
  storeId: string,
  sessionId: string,
  query: { beforeCreatedAt?: number; beforeId?: string; limit: number },
) {
  return services.db
    .select({
      id: orders.id,
      createdAt: orders.created_at,
      status: orders.status,
      snapshot: orders.snapshot_json,
    })
    .from(orders)
    .where(
      and(
        eq(orders.store_id, storeId),
        eq(orders.table_session_id, sessionId),
        query.beforeCreatedAt !== undefined && query.beforeId
          ? or(
              lt(orders.created_at, query.beforeCreatedAt),
              and(eq(orders.created_at, query.beforeCreatedAt), lt(orders.id, query.beforeId)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(orders.created_at), desc(orders.id))
    .limit(query.limit + 1);
}

export async function customerOrderValue(
  services: ApiServices,
  storeId: string,
  membershipId: string,
  rows: Awaited<ReturnType<typeof customerOrderRows>>,
  limit: number,
) {
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const records = await services.db
    .select({
      orderId: customerConsumption.orderId,
      lineId: customerConsumption.lineId,
      quantity: customerConsumption.quantity,
      shared: customerConsumption.shared,
      revision: customerConsumption.revision,
    })
    .from(customerConsumption)
    .where(
      and(
        eq(customerConsumption.storeId, storeId),
        eq(customerConsumption.membershipId, membershipId),
        inArray(
          customerConsumption.orderId,
          page.map((order) => order.id),
        ),
      ),
    );
  const byOrder = Map.groupBy(records, (record) => record.orderId);
  return {
    orders: page.map((order) => ({
      id: order.id,
      status: order.status,
      snapshot: snapshotSchema.parse(JSON.parse(order.snapshot)),
      personalRecords: byOrder.get(order.id) ?? [],
    })),
    nextOrderId: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
    nextOrderCursor:
      rows.length > limit && last
        ? { beforeCreatedAt: String(last.createdAt), beforeId: last.id }
        : null,
  };
}
