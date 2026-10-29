import type { BatchItem } from "drizzle-orm/batch";
import { business, createDatabase } from "@tablecast/api/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { SeedEnv } from "../tablecast-seed-data.ts";
import type { DemoCredentials } from "../tablecast-seed.ts";
import { demoStores } from "../tablecast-fixtures.ts";

/** 明示された開発用seed店舗の設定だけを作り直し、注文と会計を保つ。 */
export async function rebuildSeedConfigurations(env: SeedEnv, credentials: DemoCredentials) {
  if (env.TABLECAST_ENV !== "development")
    throw new Error("設定の再作成は開発環境に限定されています。");
  const stores = demoStores(credentials.profile);
  const db = createDatabase(env.TABLECAST_DB);
  const existing = await db
    .select({
      id: business.stores.id,
      version: business.stores.config_version,
      publisher: business.configReleases.published_by,
    })
    .from(business.stores)
    .leftJoin(
      business.configReleases,
      and(
        eq(business.configReleases.store_id, business.stores.id),
        eq(business.configReleases.version, business.stores.config_version),
      ),
    )
    .where(
      inArray(
        business.stores.id,
        stores.map((store) => store.id),
      ),
    );
  const statements: BatchItem<"sqlite">[] = [];
  for (const row of existing) {
    const store = stores.find((value) => value.id === row.id);
    if (!row.publisher)
      throw new Error("seedの公開元ユーザーを確認できません。設定を変更せず終了します。");
    if (!store) throw new Error("設定を再作成するseed店舗がありません。");
    const config = JSON.stringify(store.configuration);
    const version = row.version + 1;
    statements.push(
      db
        .update(business.stores)
        .set({ config_json: config, config_version: version, updated_at: Date.now() })
        .where(
          and(eq(business.stores.id, row.id), eq(business.stores.config_version, row.version)),
        ),
      db.delete(business.configDrafts).where(eq(business.configDrafts.store_id, row.id)),
      db.delete(business.configReleases).where(eq(business.configReleases.store_id, row.id)),
      db.insert(business.configReleases).values({
        store_id: row.id,
        version,
        config_json: config,
        published_by: row.publisher,
        source_draft_id: null,
        created_at: Date.now(),
      }),
      db
        .update(business.demoSessions)
        .set({
          config_json: config,
          config_version: version,
          source_draft_id: null,
          source_version: version,
        })
        .where(
          inArray(
            business.demoSessions.session_id,
            db
              .select({ id: business.tableSessions.id })
              .from(business.tableSessions)
              .where(eq(business.tableSessions.store_id, row.id)),
          ),
        ),
      db
        .update(business.confirmations)
        .set({ status: "invalid" })
        .where(
          and(
            eq(business.confirmations.store_id, row.id),
            inArray(business.confirmations.status, ["pending", "read"]),
          ),
        ),
      db
        .update(business.tableSessions)
        .set({
          voice_state: "stopped",
          voice_session_id: null,
          active_turn_id: null,
          voice_version: sql`voice_version+1`,
        })
        .where(eq(business.tableSessions.store_id, row.id)),
    );
  }
  const [first, ...remaining] = statements;
  if (first) await db.batch([first, ...remaining]);
}
