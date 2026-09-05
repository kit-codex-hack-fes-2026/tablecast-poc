import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";
import { seedDemoDatabase, tablecastHistoryBaseTime } from "./tablecast-seed-data";
import type { DemoCredentials } from "./tablecast-seed";

const execute = promisify(execFile);

it("隔離した実D1へ30日の600履歴と2400注文を投入し、再実行しても営業中の卓と残額を変えない", async () => {
  // Given: 現在のworktreeのDBを使わない独立したWorkers binding。
  const directory = await mkdtemp(join(tmpdir(), "tablecast-seed-test-"));
  const configPath = join(directory, "wrangler.json");
  const state = join(directory, "state");
  await writeFile(
    configPath,
    JSON.stringify({
      name: "tablecast-seed-test",
      compatibility_date: "2026-09-03",
      compatibility_flags: ["nodejs_compat"],
      vars: {
        TABLECAST_ENV: "development",
        TABLECAST_PUBLIC_ORIGIN: "http://localhost:3999",
        TABLECAST_AUTH_SECRET: "tablecast-seed-test-secret-not-used-in-deployment",
      },
      d1_databases: [
        {
          binding: "TABLECAST_DB",
          database_name: "tablecast-seed-test",
          database_id: "00000000-0000-0000-0000-000000000001",
          migrations_dir: resolve("apps/api/migrations"),
        },
      ],
    }),
  );
  const credentials: DemoCredentials = {
    email: "tablecast-owner@example.test",
    password: "tablecast-local-seed-test-password",
    otherEmail: "tablecast-other@example.test",
    otherPassword: "tablecast-local-other-test-password",
    baseTime: Date.UTC(2026, 8, 6, 0),
    profile: "history",
  };
  try {
    await execute(
      process.execPath,
      [
        resolve("node_modules/wrangler/bin/wrangler.js"),
        "d1",
        "migrations",
        "apply",
        "TABLECAST_DB",
        "--local",
        "--config",
        configPath,
        "--persist-to",
        state,
      ],
      {
        env: {
          ...process.env,
          WRANGLER_LOG_PATH: join(directory, "tablecast-migrate.log"),
          CI: "true",
        },
      },
    );
    const platform = await getPlatformProxy<TablecastEnv>({
      configPath,
      envFiles: [],
      persist: { path: join(state, "v3") },
      remoteBindings: false,
    });
    try {
      const db = platform.env.TABLECAST_DB;
      // When: 実際のseedと同じ入口から一度投入する。
      const counts = await seedDemoDatabase(platform.env, credentials);
      // Then: 規模だけでなく組織、プラン、支払、時系列の整合性を持つ。
      expect(counts).toMatchObject({
        stores: 3,
        tables: 36,
        historicalSessions: 600,
        orders: 2415,
      });
      expect(Number(counts?.events)).toBeGreaterThanOrEqual(20_000);
      expect(
        await db
          .prepare(
            "SELECT COUNT(*) AS count FROM stores s JOIN team t ON t.id=s.team_id AND t.organization_id=s.organization_id",
          )
          .first(),
      ).toEqual({ count: 3 });
      expect(
        await db
          .prepare(
            "SELECT COUNT(DISTINCT CAST((opened_at-?)/86400000 AS INTEGER)) AS days FROM table_sessions WHERE id LIKE '%-history-%'",
          )
          .bind(tablecastHistoryBaseTime)
          .first(),
      ).toEqual({ days: 30 });
      expect(
        await db
          .prepare(
            "SELECT COUNT(*) AS count FROM table_sessions WHERE plan_json IS NOT NULL AND status='open'",
          )
          .first(),
      ).toEqual({ count: 3 });
      expect(
        await db
          .prepare(
            "SELECT COUNT(*) AS count FROM restaurant_tables t WHERE NOT EXISTS(SELECT 1 FROM table_sessions s WHERE s.table_id=t.id AND s.status='open')",
          )
          .first(),
      ).toEqual({ count: 6 });
      expect(
        await db
          .prepare(
            "SELECT s.id FROM table_sessions s WHERE status='closed' AND (SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.table_session_id=s.id)!=(SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.table_session_id=s.id)",
          )
          .all(),
      ).toMatchObject({ results: [] });
      expect(
        await db
          .prepare(
            "SELECT o.id FROM orders o JOIN confirmations c ON c.id=o.snapshot_id JOIN table_sessions s ON s.id=o.table_session_id WHERE o.store_id!=s.store_id OR c.store_id!=o.store_id OR o.total!=json_extract(o.snapshot_json,'$.total') OR o.created_at<c.created_at OR o.updated_at<o.created_at",
          )
          .all(),
      ).toMatchObject({ results: [] });
      expect(
        await db
          .prepare(
            "SELECT cursor FROM (SELECT cursor,created_at,LAG(created_at) OVER(PARTITION BY table_session_id ORDER BY cursor) AS previous FROM table_events) WHERE created_at<previous",
          )
          .all(),
      ).toMatchObject({ results: [] });
      expect(await db.prepare("PRAGMA foreign_key_check").all()).toMatchObject({ results: [] });
      const reserved = "tablecast-komorebi-table-01-session";
      await db.prepare("UPDATE table_sessions SET cart_version=17 WHERE id=?").bind(reserved).run();
      const repeated = await seedDemoDatabase(platform.env, credentials);
      expect(repeated).toEqual(counts);
      expect(
        await db
          .prepare("SELECT cart_version FROM table_sessions WHERE id=?")
          .bind(reserved)
          .first(),
      ).toEqual({ cart_version: 17 });
      await expect(
        seedDemoDatabase({ ...platform.env, TABLECAST_ENV: "production" }, credentials),
      ).rejects.toThrow("開発環境");
    } finally {
      await platform.dispose();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 120_000);
