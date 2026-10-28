import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq, sql } from "drizzle-orm";
import { expect, inject, it } from "vitest";
import { customerPointVisits } from "../src/db/rewards-schema";
import { tableSessions } from "../src/db/table-schema";
import { getTimeline } from "../src/modules/tables/timeline";
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
    // 現行の認証fixtureを使い、履歴schemaと独立した認証互換migrationだけ先行する。
    const authCompatibility = migrations.find((migration) =>
      migration.name.includes("0025_tablecast_auth_account_compat"),
    );
    if (!authCompatibility) throw new Error("認証互換migrationが必要です");
    const billingCompatibility = migrations.find((migration) =>
      migration.name.includes("0026_tablecast_organization_billing"),
    );
    if (!billingCompatibility) throw new Error("課金の認証列migrationが必要です");
    const passwordlessCompatibility = migrations.find((migration) =>
      migration.name.includes("0028_tablecast_passwordless"),
    );
    if (!passwordlessCompatibility) throw new Error("パスワードレス認証のmigrationが必要です");
    await applyD1Migrations(env.TABLECAST_DB, [
      authCompatibility,
      billingCompatibility,
      passwordlessCompatibility,
    ]);
    // 現行の来店fixtureに必要な呼出し列だけ先行し、検証対象の履歴・索引schemaは旧状態を保つ。
    const callCompatibility = migrations.find((migration) =>
      migration.name.includes("0030_tablecast_staff_calls"),
    );
    if (!callCompatibility) throw new Error("呼び出しのmigrationが必要です");
    await applyD1Migrations(env.TABLECAST_DB, [callCompatibility]);
    // 履歴の移行対象と独立したnullable表示列だけを現行fixtureへ揃える。
    const menuSearchCompatibility = migrations.find((migration) =>
      migration.name.includes("0031_tablecast_menu_search"),
    );
    if (!menuSearchCompatibility) throw new Error("検索条件のmigrationが必要です");
    await applyD1Migrations(env.TABLECAST_DB, [menuSearchCompatibility]);
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
