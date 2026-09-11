import { observeOperation } from "../../platform/telemetry";
import { and, eq, sql } from "drizzle-orm";
import * as business from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import { configurationSchema, type Catalog } from "../configuration/model";
export async function getCatalog(
  services: ApiServices,
  storeId: string,
  demoId?: string,
): Promise<Catalog> {
  return observeOperation(
    "tablecast.catalog.read",
    async () => {
      const db = services.db;

      const store = await db
        .select()
        .from(business.stores)
        .where(eq(business.stores.id, storeId))
        .get();
      ensure(store, "STORE_NOT_FOUND", 404);
      const demo = demoId
        ? await db
            .select()
            .from(business.demoSessions)
            .innerJoin(
              business.tableSessions,
              eq(business.tableSessions.id, business.demoSessions.session_id),
            )
            .where(
              and(
                eq(business.demoSessions.session_id, demoId),
                eq(business.tableSessions.store_id, storeId),
              ),
            )
            .get()
        : undefined;
      if (demoId) ensure(demo, "DEMO_NOT_FOUND", 404);
      return {
        storeId: store.id,
        storeName: store.name,
        version: demo?.demo_sessions.config_version ?? store.config_version,
        configuration: configurationSchema.parse(
          JSON.parse(demo?.demo_sessions.config_json ?? store.config_json),
        ),
      };
    },
    { env: services.env, input: { storeId } },
  );
}

// 確認作成と注文確定を、同じセッションの現在版に対して原子的に判定する。
export function sessionConfigVersion(storeId: string, sessionId: string | undefined) {
  return sql`coalesce((SELECT config_version FROM demo_sessions WHERE session_id=${sessionId ?? null}), (SELECT config_version FROM stores WHERE id=${storeId}))`;
}
