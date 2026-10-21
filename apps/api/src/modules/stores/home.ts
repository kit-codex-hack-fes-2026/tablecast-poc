import { and, eq, exists, sql } from "drizzle-orm";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import { devices, stores } from "../../db/table-schema";
import { ensure } from "../../platform/errors";
import { requireManager } from "../auth/policy";

export async function getHomeSummary(services: ApiServices, actor: Actor) {
  requireManager(actor);
  const { db } = services;
  const row = await db
    .select({
      hasProducts: sql<number>`json_array_length(${stores.config_json}, '$.products') > 0`.mapWith(
        Boolean,
      ),
      hasDevices: exists(
        db
          .select({ id: devices.id })
          .from(devices)
          .where(and(eq(devices.store_id, stores.id), sql`${devices.revoked_at} IS NULL`)),
      ).mapWith(Boolean),
    })
    .from(stores)
    .where(eq(stores.id, actor.storeId))
    .get();
  ensure(row, "STORE_NOT_FOUND", 404);
  return { storeId: actor.storeId, ...row };
}
