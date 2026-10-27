import { and, eq, isNull } from "drizzle-orm";
import type { ApiServices } from "../../platform/context";
import { member } from "../../db/identity-schema";
import { devices, stores, tableSessions } from "../../db/table-schema";
import { sessionPlanUsage } from "../orders/queries";
export async function findDeviceSession(
  services: ApiServices,
  tokenHash: string,
  includeCatalog = false,
) {
  return (
    services.db
      .select({
        session: tableSessions,
        deviceId: devices.id,
        ...(includeCatalog
          ? {
              planUsage: sessionPlanUsage(services.db),
              catalog: {
                id: stores.id,
                name: stores.name,
                config_version: stores.config_version,
                config_json: stores.config_json,
              },
            }
          : {}),
      })
      .from(devices)
      .innerJoin(
        tableSessions,
        and(
          eq(tableSessions.table_id, devices.table_id),
          eq(tableSessions.store_id, devices.store_id),
          eq(tableSessions.status, "open"),
        ),
      )
      // プラン利用中は注文履歴と価格設定を後段でまとめて取得する。
      .leftJoin(stores, eq(stores.id, tableSessions.store_id))
      .where(and(eq(devices.token_hash, tokenHash), isNull(devices.revoked_at)))
      .get()
  );
}
export async function findStoreMembership(services: ApiServices, userId: string, storeId: string) {
  return services.db
    .select({ role: member.role })
    .from(member)
    .innerJoin(stores, eq(stores.organization_id, member.organizationId))
    .where(and(eq(member.userId, userId), eq(stores.id, storeId)))
    .get();
}
