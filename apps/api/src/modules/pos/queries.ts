import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import { posCheckouts, posConnections } from "../../db/pos-schema";
import { configReleases, payments, stores } from "../../db/table-schema";
import { readConfiguration } from "../configuration/food-compatibility";
import { getTableState } from "../tables/queries";
import { buildPosInvoice } from "./invoice";
import { posMappingSchema } from "./model";

export function findPosConnection(services: ApiServices, storeId: string) {
  return services.db.select().from(posConnections).where(eq(posConnections.storeId, storeId)).get();
}
export function latestPosCheckout(services: ApiServices, actor: Actor) {
  return services.db
    .select()
    .from(posCheckouts)
    .where(
      and(
        eq(posCheckouts.storeId, actor.storeId),
        eq(posCheckouts.sessionId, actor.tableSessionId ?? ""),
      ),
    )
    .orderBy(
      sql`CASE WHEN ${posCheckouts.status} IN ('preparing','pending','review') THEN 0 ELSE 1 END`,
      desc(posCheckouts.createdAt),
      desc(posCheckouts.id),
    )
    .limit(1)
    .get();
}
export async function currentPosInvoice(
  services: ApiServices,
  actor: Actor,
  connection: typeof posConnections.$inferSelect | undefined,
) {
  const table = await getTableState(services, actor);
  const versions = [...new Set(table.orders.map((order) => order.snapshot.configVersion))];
  const [releases, adjustments] = await services.db.batch([
    services.db
      .select({ version: configReleases.version, config_json: configReleases.config_json })
      .from(configReleases)
      .where(
        and(
          eq(configReleases.store_id, actor.storeId),
          inArray(configReleases.version, versions.length ? versions : [-1]),
        ),
      )
      .union(
        services.db
          .select({ version: stores.config_version, config_json: stores.config_json })
          .from(stores)
          .where(eq(stores.id, actor.storeId)),
      ),
    services.db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.store_id, actor.storeId),
          eq(payments.table_session_id, table.id),
          eq(payments.kind, "adjustment"),
        ),
      ),
  ]);
  const configurations = new Map(
    releases.map((row) => [row.version, readConfiguration(JSON.parse(row.config_json))]),
  );
  const result = buildPosInvoice({
    table,
    orders: table.orders,
    configurations,
    mappings: posMappingSchema.array().parse(JSON.parse(connection?.mappingsJson ?? "[]")),
    adjustments: adjustments.map((row) => ({ id: row.id, amount: row.amount, reason: row.reason })),
  });
  return { ...result, table };
}
