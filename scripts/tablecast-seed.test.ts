import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { deploymentOwner, tableSessions, stores } from "../apps/api/src/db/business-schema";
import { account, user, organization } from "../apps/api/src/db/auth-schema";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";
import {
  seedDemoDatabase,
  seedPreviewDatabase,
  tablecastHistoryBaseTime,
} from "./tablecast-seed-data";
import type { DemoCredentials } from "./tablecast-seed";
import { configurationSchema } from "../apps/api/src/schema";
import { uploadPreviewImage } from "./tablecast-deploy";

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
      r2_buckets: [{ binding: "TABLECAST_MEDIA", bucket_name: "tablecast-seed-test-media" }],
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
      const db = drizzle(platform.env.TABLECAST_DB);
      // 実R2 bindingでも条件付きPUTとMD5による再開判定が成立する。
      const imageKey = "tablecast/demo/tablecast-test.png";
      const imageBytes = new TextEncoder().encode("tablecast-test-image");
      await uploadPreviewImage(platform.env.TABLECAST_MEDIA, imageKey, imageBytes);
      const imageVersion = (await platform.env.TABLECAST_MEDIA.head(imageKey))?.version;
      await uploadPreviewImage(platform.env.TABLECAST_MEDIA, imageKey, imageBytes);
      expect((await platform.env.TABLECAST_MEDIA.head(imageKey))?.version).toBe(imageVersion);
      const preview = {
        ...platform.env,
        TABLECAST_ENV: "preview",
        TABLECAST_PUBLIC_ORIGIN: "https://tablecast-pr-34.kit-codex.workers.dev",
      };
      await db.run(
        sql`CREATE TABLE tablecast_deployment_owner(repository TEXT, environment TEXT, seeded INTEGER)`,
      );
      await db.insert(deploymentOwner).values({
        repository: "kit-codex-hack-fes-2026/tablecast-poc",
        environment: "tablecast-pr-35",
        seeded: 0,
      });
      await expect(seedPreviewDatabase(preview, credentials)).rejects.toThrow("所有情報");
      await expect(
        seedPreviewDatabase({ ...preview, TABLECAST_ENV: "production" }, credentials),
      ).rejects.toThrow("対象");
      await db.update(deploymentOwner).set({ environment: "tablecast-pr-34" });
      // When: 所有権を確認した空のPR DBへ初期投入する。
      expect(await seedPreviewDatabase(preview, credentials)).toBe(true);
      expect(
        await db.select({ seeded: deploymentOwner.seeded }).from(deploymentOwner).get(),
      ).toEqual({
        seeded: 2,
      });
      // Then: 画像待ちから再開してもDBの初期化をやり直さない。
      await db.update(user).set({ name: "保持する名前" }).where(eq(user.email, credentials.email));
      expect(await seedPreviewDatabase(preview, credentials)).toBe(true);
      expect(
        await db
          .select({ name: user.name })
          .from(user)
          .where(eq(user.email, credentials.email))
          .get(),
      ).toEqual({
        name: "保持する名前",
      });
      await db.update(deploymentOwner).set({ seeded: 0 });
      await expect(seedPreviewDatabase(preview, credentials)).rejects.toThrow("途中状態");
      await db.update(deploymentOwner).set({ seeded: 1 });
      expect(await seedPreviewDatabase(preview, credentials)).toBe(false);
      const counts = await seedDemoDatabase(platform.env, credentials);
      // Then: 規模だけでなく組織、プラン、支払、時系列の整合性を持つ。
      expect(counts).toMatchObject({
        stores: 3,
        tables: 36,
        historicalSessions: 600,
        orders: 2415,
      });
      expect(counts.events).toBeGreaterThanOrEqual(20_000);
      const catalogs = {
        results: await db.all<{ config_json: string }>(sql`SELECT config_json FROM stores`),
      };
      const products = catalogs.results.flatMap(
        (row) => configurationSchema.parse(JSON.parse(row.config_json)).products,
      );
      expect(products).toHaveLength(180);
      for (const product of products) {
        expect(product.imageKey).toMatch(/^tablecast\/demo\/[a-z-]+\.png$/);
        expect(product.imageKind).toBe("illustration");
        expect(product.allergens.note.ja).toContain("混入は未確認");
        expect(product.allergens.note.en).toContain("cross-contact");
        expect(product.allergens.note.en).toContain("unverified");
      }
      for (const product of products.filter((item) => item.categoryId !== "sake")) {
        expect(product.allergens.note.ja).toContain(product.text.ja.description);
        expect(product.allergens.note.en).toContain(product.text.en.description);
      }
      expect(
        products.find((product) => product.id === "tablecast-komorebi-karaage")?.allergens,
      ).toMatchObject({
        contains: ["wheat", "soya"],
        evidence: "verified",
        crossContact: "unknown",
        vegan: "unknown",
      });
      expect(
        products.find((product) => product.id === "tablecast-komorebi-pickles")?.allergens,
      ).toMatchObject({
        contains: [],
        evidence: "unknown",
        crossContact: "unknown",
        vegan: "unknown",
      });
      expect(
        products.find((product) => product.id === "tablecast-komorebi-pickles")?.allergens.note.ja,
      ).toContain("詳しい原材料は未登録");
      expect(
        await db.get(sql`SELECT COUNT(DISTINCT organization_id) AS count FROM stores`),
      ).toEqual({ count: 3 });
      expect(
        await db.get(
          sql`SELECT COUNT(DISTINCT CAST((opened_at-${tablecastHistoryBaseTime})/86400000 AS INTEGER)) AS days FROM table_sessions WHERE id LIKE '%-history-%'`,
        ),
      ).toEqual({ days: 30 });
      expect(
        await db.get(
          sql`SELECT COUNT(*) AS count FROM table_sessions WHERE plan_json IS NOT NULL AND status='open'`,
        ),
      ).toEqual({ count: 3 });
      expect(
        await db.get(
          sql`SELECT COUNT(*) AS count FROM restaurant_tables t WHERE NOT EXISTS(SELECT 1 FROM table_sessions s WHERE s.table_id=t.id AND s.status='open')`,
        ),
      ).toEqual({ count: 6 });
      expect({
        results: await db.all(
          sql`SELECT s.id FROM table_sessions s WHERE status='closed' AND (SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.table_session_id=s.id)!=(SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.table_session_id=s.id)`,
        ),
      }).toMatchObject({ results: [] });
      expect({
        results: await db.all(
          sql`SELECT o.id FROM orders o JOIN confirmations c ON c.id=o.snapshot_id JOIN table_sessions s ON s.id=o.table_session_id WHERE o.store_id!=s.store_id OR c.store_id!=o.store_id OR o.total!=json_extract(o.snapshot_json,'$.total') OR o.created_at<c.created_at OR o.updated_at<o.created_at`,
        ),
      }).toMatchObject({ results: [] });
      expect({
        results: await db.all(
          sql`SELECT cursor FROM (SELECT cursor,created_at,LAG(created_at) OVER(PARTITION BY table_session_id ORDER BY cursor) AS previous FROM table_events) WHERE created_at<previous`,
        ),
      }).toMatchObject({ results: [] });
      expect(await db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
      const reserved = "tablecast-komorebi-table-01-session";
      await db
        .update(tableSessions)
        .set({ cart_version: 17 })
        .where(eq(tableSessions.id, reserved));
      const owner = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, credentials.email))
        .get();
      if (!owner) throw new Error("デモ管理者がありません。");
      await db.insert(account).values(
        ["http://127.0.0.1:38008", "http://127.0.0.1:38016", "https://accounts.google.com"].map(
          (issuer, index) => ({
            id: `tablecast-mock-${index}`,
            issuer,
            accountId: `subject-${index}`,
            providerId: "google",
            userId: owner.id,
            createdAt: new Date(1),
            updatedAt: new Date(1),
          }),
        ),
      );
      const seededIcons = {
        results: await db.all<{ url: string | null }>(
          sql`SELECT image AS url FROM user UNION ALL SELECT logo AS url FROM organization`,
        ),
      };
      expect(seededIcons.results.length).toBeGreaterThan(40);
      for (const { url } of seededIcons.results) {
        expect(url).toMatch(/^\/api\/avatars\/[a-f0-9-]+$/);
        const image = await platform.env.TABLECAST_MEDIA.get(
          `tablecast/avatars/${url?.split("/").at(-1)}`,
        );
        expect(image?.httpMetadata?.contentType).toBe("image/svg+xml");
      }
      // 店舗とユーザーが変更した画像は、再投入で初期画像へ戻さない。
      await db
        .update(user)
        .set({ image: "https://example.test/custom-user.png" })
        .where(eq(user.id, owner.id));
      await db
        .update(organization)
        .set({ logo: "https://example.test/custom-store.png" })
        .where(
          eq(
            organization.id,
            db
              .select({ id: stores.organization_id })
              .from(stores)
              .where(eq(stores.id, "tablecast-komorebi")),
          ),
        );
      const repeated = await seedDemoDatabase(platform.env, credentials);
      expect(
        await db.select({ image: user.image }).from(user).where(eq(user.id, owner.id)).get(),
      ).toEqual({
        image: "https://example.test/custom-user.png",
      });
      expect(
        await db.get(
          sql`SELECT logo FROM organization WHERE id=(SELECT organization_id FROM stores WHERE id='tablecast-komorebi')`,
        ),
      ).toEqual({ logo: "https://example.test/custom-store.png" });
      expect({
        results: await db.all(
          sql`SELECT issuer,account_id FROM account WHERE provider_id='google' ORDER BY issuer`,
        ),
      }).toMatchObject({
        results: [
          { issuer: "https://accounts.google.com", account_id: "subject-2" },
          { issuer: "https://tablecast-google.localhost", account_id: credentials.email },
        ],
      });
      expect(
        await db.get(
          sql`SELECT COUNT(*) count FROM stores s JOIN organization o ON o.id=s.organization_id AND o.name=s.name`,
        ),
      ).toEqual({ count: 3 });
      expect(
        await db.get(
          sql`SELECT COUNT(*) count FROM member m JOIN stores s ON s.organization_id=m.organization_id`,
        ),
      ).toEqual({ count: 42 });
      expect(await db.get(sql`SELECT COUNT(*) count FROM team`)).toEqual({ count: 0 });
      expect(repeated).toEqual(counts);
      expect(
        await db
          .select({ cart_version: tableSessions.cart_version })
          .from(tableSessions)
          .where(eq(tableSessions.id, reserved))
          .get(),
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
