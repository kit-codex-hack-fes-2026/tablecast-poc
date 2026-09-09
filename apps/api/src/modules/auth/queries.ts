import { sql } from "drizzle-orm";
import type { ApiServices } from "../../platform/context";
export async function findDeviceSession(services: ApiServices, tokenHash: string) {
  const db = services.db;
  return db.get<{ store_id: string; id: string } | undefined>(
    sql`SELECT d.store_id,s.id FROM devices d JOIN table_sessions s ON s.table_id=d.table_id AND s.store_id=d.store_id AND s.status='open' WHERE d.token_hash=${tokenHash} AND d.revoked_at IS NULL`,
  );
}
export async function findStoreMembership(services: ApiServices, userId: string, storeId: string) {
  const db = services.db;
  return db.get<{ role: string } | undefined>(
    sql`SELECT m.role FROM member m JOIN stores s ON s.organization_id=m.organization_id WHERE m.user_id=${userId} AND s.id=${storeId}`,
  );
}
