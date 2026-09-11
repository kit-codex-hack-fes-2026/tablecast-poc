import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { sql } from "drizzle-orm";
import { expect, inject, it } from "vitest";
import * as auth from "../src/db/auth-schema";
import * as business from "../src/db/business-schema";
import { fixtureDb } from "./database-fixture";
import { configuration, resetFixtureStorage } from "./fixture";

it("デモ移行前に卓・注文・会話がある場合、移行しても値・外部キー・開卓制約を維持する", async () => {
  await resetFixtureStorage();
  const migrations = inject("tablecastMigrations");
  const demoMigration = migrations.find((migration) =>
    migration.name.includes("0013_tablecast_demo"),
  );
  if (!demoMigration) throw new Error("デモmigrationが必要です");
  await applyD1Migrations(
    env.TABLECAST_DB,
    migrations.filter((migration) => migration !== demoMigration),
  );
  await fixtureDb.insert(auth.organization).values({
    id: "tablecast-migration-org",
    name: "移行試験",
    slug: "tablecast-migration",
    createdAt: new Date(),
  });
  await fixtureDb.insert(business.stores).values({
    id: "tablecast-migration-store",
    organization_id: "tablecast-migration-org",
    name: "移行試験",
    config_json: JSON.stringify(configuration),
    updated_at: 1,
  });
  await fixtureDb
    .insert(business.restaurantTables)
    .values({ id: "tablecast-migration-table", store_id: "tablecast-migration-store", name: "01" });
  // 旧schemaにはkind列がないため、旧列を指定して移行前の状態を作る。
  await fixtureDb.run(
    sql`INSERT INTO table_sessions (id,store_id,table_id,locale,guest_count,opened_at,cart_json) VALUES ('tablecast-migration-session','tablecast-migration-store','tablecast-migration-table','ja',2,123,'[]')`,
  );
  await fixtureDb.insert(business.confirmations).values({
    id: "tablecast-migration-confirm",
    store_id: "tablecast-migration-store",
    table_session_id: "tablecast-migration-session",
    cart_version: 0,
    config_version: 1,
    channel: "gui",
    status: "submitted",
    snapshot_json: "{}",
    expires_at: 200,
    created_at: 100,
  });
  await fixtureDb.insert(business.orders).values({
    id: "tablecast-migration-order",
    store_id: "tablecast-migration-store",
    table_session_id: "tablecast-migration-session",
    snapshot_id: "tablecast-migration-confirm",
    idempotency_key: "tablecast-migration-key",
    status: "submitted",
    snapshot_json: "{}",
    total: 800,
    created_at: 100,
    updated_at: 100,
  });
  await fixtureDb.insert(business.tableEvents).values({
    store_id: "tablecast-migration-store",
    table_session_id: "tablecast-migration-session",
    kind: "voice.user",
    data_json: JSON.stringify({ text: "注文します" }),
    created_at: 100,
  });
  const beforeOrders = await fixtureDb.select().from(business.orders);
  const beforeEvents = await fixtureDb.select().from(business.tableEvents);
  await applyD1Migrations(env.TABLECAST_DB, [demoMigration]);
  expect(await fixtureDb.select().from(business.orders)).toEqual(beforeOrders);
  expect(await fixtureDb.select().from(business.tableEvents)).toEqual(beforeEvents);
  expect(await fixtureDb.select().from(business.tableSessions)).toEqual([
    expect.objectContaining({
      kind: "table",
      table_id: "tablecast-migration-table",
      opened_at: 123,
      guest_count: 2,
    }),
  ]);
  expect(await fixtureDb.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
  await expect(
    fixtureDb.insert(business.tableSessions).values({
      id: "tablecast-duplicate",
      store_id: "tablecast-migration-store",
      table_id: "tablecast-migration-table",
      locale: "ja",
      guest_count: 1,
      opened_at: 456,
    }),
  ).rejects.toHaveProperty("cause.message", expect.stringContaining("UNIQUE constraint failed"));
  await expect(
    fixtureDb.insert(business.tableSessions).values({
      id: "tablecast-null-live",
      store_id: "tablecast-migration-store",
      table_id: null,
      locale: "ja",
      guest_count: 1,
      opened_at: 456,
    }),
  ).rejects.toHaveProperty("cause.message", expect.stringContaining("CHECK constraint failed"));
});
