import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq, sql } from "drizzle-orm";
import { expect, inject, it } from "vitest";
import { tableSessions, timelineDays } from "../src/db/business-schema";
import { fixtureDb } from "./database-fixture";
import { device, resetFixtureStorage, setupFixture } from "./fixture";

it("既存の長期滞在を日付索引へ移行し、変更・demo化・削除を同じ書込で反映する", async () => {
  await resetFixtureStorage();
  const migrations = inject("tablecastMigrations");
  const index = migrations.findIndex((migration) =>
    migration.name.includes("0017_tablecast_timeline_day_index"),
  );
  expect(index).toBeGreaterThan(0);
  await applyD1Migrations(env.TABLECAST_DB, migrations.slice(0, index));
  await setupFixture();
  const day = 86_400_000;
  const start = Date.parse("2026-09-01T00:00:00+09:00");
  const id = "tablecast-day-index";
  await fixtureDb.insert(tableSessions).values({
    id,
    store_id: device.storeId,
    table_id: "tablecast-table",
    locale: "ja",
    guest_count: 2,
    status: "closed",
    opened_at: start - 70 * day,
    closed_at: start + 1000,
  });
  await applyD1Migrations(env.TABLECAST_DB, migrations.slice(index));
  const days = () =>
    fixtureDb
      .select()
      .from(timelineDays)
      .where(eq(timelineDays.table_session_id, id))
      .orderBy(timelineDays.day_start);
  expect((await days()).map((row) => row.day_start)).toEqual(
    Array.from({ length: 71 }, (_, i) => start - (70 - i) * day),
  );
  await fixtureDb
    .update(tableSessions)
    .set({ opened_at: start, closed_at: start + day })
    .where(eq(tableSessions.id, id));
  expect(await days()).toEqual([
    { table_session_id: id, store_id: device.storeId, day_start: start, opened_at: start },
  ]);
  await fixtureDb.update(tableSessions).set({ closed_at: null }).where(eq(tableSessions.id, id));
  expect(await days()).toEqual([]);
  await fixtureDb.update(tableSessions).set({ closed_at: start }).where(eq(tableSessions.id, id));
  expect(await days()).toHaveLength(1);
  await fixtureDb
    .update(tableSessions)
    .set({ kind: "demo", table_id: null })
    .where(eq(tableSessions.id, id));
  expect(await days()).toEqual([]);
  await fixtureDb
    .update(tableSessions)
    .set({ kind: "table", table_id: "tablecast-table" })
    .where(eq(tableSessions.id, id));
  expect(await days()).toHaveLength(1);
  await fixtureDb.delete(tableSessions).where(eq(tableSessions.id, id));
  expect(await days()).toEqual([]);
  expect(await fixtureDb.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
});
