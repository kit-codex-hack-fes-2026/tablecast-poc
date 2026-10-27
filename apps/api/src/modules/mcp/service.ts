import { sql } from "drizzle-orm";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import { ensure } from "../../platform/errors";
export async function resolveMcpActor(
  services: ApiServices,
  principal: Awaited<
    ReturnType<Awaited<ReturnType<ApiServices["getAuth"]>>["api"]["tablecastMcpPrincipal"]>
  >,
  requestedStoreId?: string,
) {
  const db = services.db;
  const rows = await db.all<{ id: string; role: string }>(
    sql`SELECT s.id,m.role FROM stores s JOIN member m ON m.organization_id=s.organization_id WHERE s.organization_id=${principal.organizationId} AND m.user_id=${principal.userId} ORDER BY s.id`,
  );
  const storeId = requestedStoreId ?? rows[0]?.id;
  const row = rows.find((store) => store.id === storeId);
  ensure(row, "STORE_FORBIDDEN", 403);
  return {
    kind: "mcp",
    storeId: row.id,
    userId: principal.userId,
    role: row.role,
    canWrite: principal.canWrite,
  } satisfies Actor;
}
