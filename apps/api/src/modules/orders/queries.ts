import { and, eq, max, notInArray, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../../db/client";
import * as business from "../../db/business-schema";
import { inactiveOrderStatuses, planUsageSchema } from "./model";

export function planUsageQuery(db: Database, sessionId: SQL | string, storeId: SQL | string) {
  // snapshotの配列を展開する表関数だけをSQL断片とし、全snapshotをWorkerへ転送しない。
  return db
    .select({
      quantity: sql<number>`coalesce(sum(json_extract(tablecast_line.value,'$.quantity')),0)`
        .mapWith(Number)
        .as("tablecast_plan_quantity"),
      lastOrderAt: max(business.orders.created_at).as("tablecast_last_order_at"),
    })
    .from(business.orders)
    .innerJoin(
      sql`json_each(${business.orders.snapshot_json},'$.lines') AS tablecast_line`,
      sql`true`,
    )
    .where(
      and(
        eq(business.orders.table_session_id, sessionId),
        eq(business.orders.store_id, storeId),
        notInArray(business.orders.status, [...inactiveOrderStatuses]),
        sql`json_extract(tablecast_line.value,'$.planCovered')=1`,
      ),
    );
}

export function sessionPlanUsage(db: Database) {
  const usage = planUsageQuery(
    db,
    sql`${business.tableSessions.id}`,
    sql`${business.tableSessions.store_id}`,
  ).as("tablecast_usage");
  const query = db
    .select({
      value: sql<string>`json_object('quantity',${usage.quantity},'lastOrderAt',${usage.lastOrderAt})`,
    })
    .from(usage);
  return sql`CASE WHEN ${business.tableSessions.plan_json} IS NULL THEN NULL ELSE (${query}) END`.mapWith(
    (value: unknown) =>
      value === null ? null : planUsageSchema.parse(JSON.parse(z.string().parse(value))),
  );
}
