import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { sql } from "drizzle-orm";
import { expect, inject, it } from "vitest";
import { configDrafts, configReleases } from "../src/db/table-schema";
import { fixtureDb } from "./database-fixture";
import { configuration, resetFixtureStorage, setupFixture } from "./fixture";

it("履歴の由来を記録する列を追加しても旧snapshotを変えず、未記録の由来を補わない", async () => {
  await resetFixtureStorage();
  const migrations = inject("tablecastMigrations");
  const index = migrations.findIndex((migration) =>
    migration.name.includes("0027_tablecast_configuration_history"),
  );
  if (index < 1) throw new Error("履歴のmigrationが必要です");
  await applyD1Migrations(env.TABLECAST_DB, migrations.slice(0, index));
  const { staff } = await setupFixture();
  const snapshot = JSON.stringify(configuration);
  // 移行前の列だけで既存の公開版と破棄下書きを再現する。
  await fixtureDb.run(
    sql`INSERT INTO config_releases(store_id,version,config_json,published_by,created_at) VALUES (${staff.storeId},1,${snapshot},${staff.userId},1)`,
  );
  await fixtureDb.run(
    sql`INSERT INTO config_drafts(id,store_id,base_version,version,status,config_json,created_by,created_at,updated_at) VALUES ('tablecast-legacy-draft',${staff.storeId},1,2,'discarded',${snapshot},${staff.userId},1,2)`,
  );
  await applyD1Migrations(env.TABLECAST_DB, migrations.slice(index));
  expect(await fixtureDb.select().from(configReleases)).toContainEqual(
    expect.objectContaining({ version: 1, config_json: snapshot, source_draft_id: null }),
  );
  expect(await fixtureDb.select().from(configDrafts)).toContainEqual(
    expect.objectContaining({
      id: "tablecast-legacy-draft",
      version: 2,
      status: "discarded",
      config_json: snapshot,
      restored_from_version: null,
    }),
  );
  expect(await fixtureDb.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
});
