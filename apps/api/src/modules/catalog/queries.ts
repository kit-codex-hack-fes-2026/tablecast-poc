import { observeOperation } from "../../platform/telemetry";
import { and, eq, inArray, sql } from "drizzle-orm";
import * as business from "../../db/business-schema";
import type { ApiServices, Database } from "../../platform/context";
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
      return catalogValue(await catalogQuery(services.db, storeId, demoId).get(), demoId);
    },
    { env: services.env, input: { storeId } },
  );
}

// 単独取得と状態読取batchで同じ店舗・デモ境界を使う。
export function catalogQuery(db: Database, storeId: string, demoId?: string) {
  return db
    .select({
      store: {
        id: business.stores.id,
        name: business.stores.name,
        config_version: business.stores.config_version,
        config_json: business.stores.config_json,
      },
      demo: {
        session_id: business.demoSessions.session_id,
        // D1 batchは列名で結果を返すため、店舗と重なる列名を分ける。
        config_version: sql<number>`${business.demoSessions.config_version}`.as(
          "demo_config_version",
        ),
        config_json: sql<string>`${business.demoSessions.config_json}`.as("demo_config_json"),
      },
    })
    .from(business.stores)
    .leftJoin(
      business.demoSessions,
      and(
        eq(business.demoSessions.session_id, demoId ?? sql`null`),
        inArray(
          business.demoSessions.session_id,
          db
            .select({ id: business.tableSessions.id })
            .from(business.tableSessions)
            .where(
              and(
                eq(business.tableSessions.id, demoId ?? sql`null`),
                eq(business.tableSessions.store_id, storeId),
              ),
            ),
        ),
      ),
    )
    .where(eq(business.stores.id, storeId));
}

export function catalogValue(
  row: Awaited<ReturnType<ReturnType<typeof catalogQuery>["get"]>>,
  demoId?: string,
): Catalog {
  ensure(row, "STORE_NOT_FOUND", 404);
  if (demoId) ensure(row.demo, "DEMO_NOT_FOUND", 404);
  const { store, demo } = row;
  return {
    storeId: store.id,
    storeName: store.name,
    version: demo?.config_version ?? store.config_version,
    configuration: configurationSchema.parse(JSON.parse(demo?.config_json ?? store.config_json)),
  };
}

// 確認作成と注文確定を、同じセッションの現在版に対して原子的に判定する。
export function sessionConfigVersion(storeId: string, sessionId: string | undefined) {
  return sql`coalesce((SELECT config_version FROM demo_sessions WHERE session_id=${sessionId ?? null}), (SELECT config_version FROM stores WHERE id=${storeId}))`;
}
