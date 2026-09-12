import { and, eq, isNull } from "drizzle-orm";
import { member } from "../../db/auth-schema";
import { devices, stores, tableSessions } from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
export async function findDeviceSession(services: ApiServices, tokenHash: string) {
  return services.db
    .select({ store_id: devices.store_id, id: tableSessions.id })
    .from(devices)
    .innerJoin(
      tableSessions,
      and(
        eq(tableSessions.table_id, devices.table_id),
        eq(tableSessions.store_id, devices.store_id),
        eq(tableSessions.status, "open"),
      ),
    )
    .where(and(eq(devices.token_hash, tokenHash), isNull(devices.revoked_at)))
    .get();
}
export async function findStoreMembership(services: ApiServices, userId: string, storeId: string) {
  return services.db
    .select({ role: member.role })
    .from(member)
    .innerJoin(stores, eq(stores.organization_id, member.organizationId))
    .where(and(eq(member.userId, userId), eq(stores.id, storeId)))
    .get();
}
