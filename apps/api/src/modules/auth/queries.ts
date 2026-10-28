import { and, eq, isNull } from "drizzle-orm";
import type { ApiServices } from "../../platform/context";
import { member } from "../../db/identity-schema";
import { devices, stores, tableSessions } from "../../db/table-schema";
import { sessionPlanUsage } from "../orders/queries";

/** 画像取得には端末と営業中の卓の境界だけを読み、カートや設定を転送しない。 */
export async function findDeviceImageSession(services: ApiServices, tokenHash: string) {
  return services.db
    .select({ sessionId: tableSessions.id, storeId: devices.store_id, deviceId: devices.id })
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
