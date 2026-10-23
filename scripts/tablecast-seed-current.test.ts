import { business, createDatabase } from "@tablecast/api/db";
import { eq, inArray, sql } from "drizzle-orm";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";
import type { DemoCredentials } from "./tablecast-seed.ts";
import { demoStores } from "./tablecast-fixtures.ts";
import { sampleLine, seedDemoDatabase } from "./tablecast-seed-data.ts";
const { orders, payments, tableEvents, tableSessions } = business;

const execute = promisify(execFile);

it("再投入で別IDの営業中卓と閉じた初期卓と未会計を保ち、別IDの閉卓履歴は新しい初期卓を妨げない", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tablecast-current-seed-test-"));
  const configPath = join(directory, "wrangler.json");
  const state = join(directory, "state");
  await writeFile(
    configPath,
    JSON.stringify({
      name: "tablecast-current-seed-test",
      compatibility_date: "2026-09-03",
      compatibility_flags: ["nodejs_compat"],
      vars: {
        TABLECAST_ENV: "development",
        TABLECAST_PUBLIC_ORIGIN: "http://localhost:3999",
        TABLECAST_AUTH_SECRET: "tablecast-current-seed-test-secret-not-used-in-deployment",
      },
      r2_buckets: [
        { binding: "TABLECAST_MEDIA", bucket_name: "tablecast-current-seed-test-media" },
      ],
      d1_databases: [
        {
          binding: "TABLECAST_DB",
          database_name: "tablecast-current-seed-test",
          database_id: "00000000-0000-4000-8000-000000000002",
        },
      ],
    }),
  );
  const credentials: DemoCredentials = {
    email: "haruka.sato@komorebi-shijo.com",
    otherEmail: "tsubasa.yamamoto@westward-burgers-kyoto.com",
    baseTime: Date.UTC(2026, 8, 6, 0),
    profile: "demo",
  };
  try {
    const migrations = execute(
      process.execPath,
      [
        resolve("scripts/tablecast-cf-local.ts"),
        "d1",
        "migrations",
        "apply",
        "00000000-0000-4000-8000-000000000002",
        "--dir",
        resolve("apps/api/migrations"),
        "--local",
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
    migrations.child.stdin?.end();
    await migrations;
    const platform = await getPlatformProxy<TablecastEnv>({
      configPath,
      envFiles: [],
      persist: { path: join(state, "v3") },
      remoteBindings: false,
    });
    try {
      const db = createDatabase(platform.env.TABLECAST_DB);
      const initial = await seedDemoDatabase(platform.env, credentials);
      expect(initial).toMatchObject({ stores: 3, tables: 36, historicalSessions: 0, orders: 15 });
      const liveId = "tablecast-current-manual-open";
      const historyId = "tablecast-current-manual-closed";
      const originalLiveId = "tablecast-komorebi-table-01-session";
      const originalHistoryId = "tablecast-komorebi-table-08-session";
      const replaced = [originalLiveId, originalHistoryId];
      const closedId = "tablecast-komorebi-table-12-session";
      const unpaidId = "tablecast-komorebi-table-04-session";
      const configuration = demoStores("demo")[0]?.configuration;
      if (!configuration) throw new Error("デモ店舗の設定がありません。");
      // 営業中の別セッション、閉卓済みの同一ID、閉卓履歴だけの卓を同時に照合する。
      await db.batch([
        db.delete(tableEvents).where(inArray(tableEvents.table_session_id, replaced)),
        db.delete(tableSessions).where(inArray(tableSessions.id, replaced)),
        db.insert(tableSessions).values([
          {
            id: liveId,
            store_id: "tablecast-komorebi",
            table_id: "tablecast-komorebi-table-01",
            status: "open",
            locale: "en",
            guest_count: 3,
            cart_version: 23,
            cart_json: JSON.stringify([{ ...sampleLine(configuration), quantity: 2 }]),
            opened_at: credentials.baseTime,
          },
          {
            id: historyId,
            store_id: "tablecast-komorebi",
            table_id: "tablecast-komorebi-table-08",
            status: "closed",
            locale: "ja",
            guest_count: 2,
            opened_at: credentials.baseTime - 60_000,
            closed_at: credentials.baseTime,
          },
        ]),
        db
          .update(tableSessions)
          .set({ status: "closed", cart_version: 29, closed_at: credentials.baseTime })
          .where(eq(tableSessions.id, closedId)),
      ]);
      const preservedIds = [liveId, historyId, closedId];
      const before = await db.batch([
        db
          .select()
          .from(tableSessions)
          .where(inArray(tableSessions.id, preservedIds))
          .orderBy(tableSessions.id),
        db.select().from(orders).where(eq(orders.table_session_id, unpaidId)),
        db.select().from(payments).where(eq(payments.table_session_id, unpaidId)),
      ]);
      expect(before[1].reduce((total, order) => total + order.total, 0)).toBeGreaterThan(0);
      expect(before[2]).toEqual([]);
      const next = { ...credentials, baseTime: credentials.baseTime + 86_400_000 };
      const repeated = await seedDemoDatabase(platform.env, next);
      expect(
        await db.batch([
          db
            .select()
            .from(tableSessions)
            .where(inArray(tableSessions.id, preservedIds))
            .orderBy(tableSessions.id),
          db.select().from(orders).where(eq(orders.table_session_id, unpaidId)),
          db.select().from(payments).where(eq(payments.table_session_id, unpaidId)),
        ]),
      ).toEqual(before);
      expect(
        await db.select().from(tableSessions).where(eq(tableSessions.id, originalLiveId)),
      ).toEqual([]);
      expect(
        await db
          .select({ status: tableSessions.status })
          .from(tableSessions)
          .where(eq(tableSessions.id, originalHistoryId))
          .get(),
      ).toEqual({ status: "open" });
      expect(await seedDemoDatabase(platform.env, next)).toEqual(repeated);
      expect(await db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
    } finally {
      await platform.dispose();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);
