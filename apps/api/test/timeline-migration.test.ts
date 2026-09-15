import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq, sql } from "drizzle-orm";
import { expect, inject, it } from "vitest";
import { tableSessions, customerPointVisits } from "../src/db/business-schema";
import { getTimeline } from "../src/modules/tables/history";
import { createApiServices } from "../src/platform/context";
import { fixtureDb } from "./database-fixture";
import { device, resetFixtureStorage, setupFixture } from "./fixture";
import legacyQueries from "./timeline-legacy-migration.json";

it.for([false, true])(
  "既存履歴と旧APIの閉卓件数を保って索引を移行する: 旧PR索引=%s",
  async (legacy) => {
    await resetFixtureStorage();
    const migrations = inject("tablecastMigrations");
    const index = migrations.findIndex((migration) =>
      migration.name.includes("0017_tablecast_timeline_day_index"),
    );
    const reserved = migrations[index];
    if (!reserved || index < 1) throw new Error("日付索引の移行記録が必要です");
    await applyD1Migrations(env.TABLECAST_DB, migrations.slice(0, index));
    const { staff } = await setupFixture();
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
    if (legacy)
      await applyD1Migrations(env.TABLECAST_DB, [{ name: reserved.name, queries: legacyQueries }]);
    await applyD1Migrations(env.TABLECAST_DB, migrations.slice(index));
    const visits = () =>
      getTimeline(createApiServices(env), staff, { date: "2026-09-01", limit: 100 });
    expect((await visits()).sessions.map((row) => row.id)).toEqual([id]);
    // migration後・新Worker配備前に旧APIと同じ更新を行ってもchanges=1を保つ。
    const closed = await fixtureDb
      .update(tableSessions)
      .set({ status: "closed", opened_at: start, closed_at: start + 1000 })
      .where(eq(tableSessions.id, staff.tableSessionId));
    expect(closed.meta.changes).toBe(1);
    expect((await visits()).sessions.map((row) => row.id)).toEqual([staff.tableSessionId, id]);
    await fixtureDb
      .update(tableSessions)
      .set({ opened_at: start + day, closed_at: start + day })
      .where(eq(tableSessions.id, id));
    expect((await visits()).sessions.map((row) => row.id)).toEqual([staff.tableSessionId]);
    // 移行時に作られた未確定のポイント規則を先に片付け、来店原本の参照制約を保つ。
    await fixtureDb.delete(customerPointVisits).where(eq(customerPointVisits.sessionId, id));
    await fixtureDb.delete(tableSessions).where(eq(tableSessions.id, id));
    expect(await fixtureDb.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
    expect(
      await fixtureDb.all(
        sql`SELECT name FROM sqlite_schema WHERE type='trigger' AND name LIKE 'tablecast_timeline_days_%'`,
      ),
    ).toEqual([]);
  },
);
