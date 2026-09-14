import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  deploymentOwner,
  tableSessions,
  tableEvents,
  stores,
} from "../apps/api/src/db/business-schema";
import { account, user, organization, member } from "../apps/api/src/db/auth-schema";
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
import { voiceTurnSchema } from "../apps/api/src/modules/voice/model";
import { z } from "zod";
import { uploadPreviewImage } from "./tablecast-seed-media";
import { demoStores } from "./tablecast-fixtures";
import { legacyIdentityIconUrl } from "./tablecast-seed-icons";

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
    email: "haruka.sato@komorebi-shijo.com",
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
      // Given: R2障害で認証ユーザーだけが作成された、運用者が確認済みのPR。
      await db.insert(user).values({
        id: "tablecast-partial-owner",
        email: "tablecast-owner@example.test",
        name: "保持する名前",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await expect(seedPreviewDatabase(preview, credentials)).rejects.toThrow("途中状態");
      await db.update(deploymentOwner).set({ seeded: 3 });
      // When: 既存の認証ユーザーを保持して残りを初期投入する。
      expect(await seedPreviewDatabase(preview, credentials)).toBe(true);
      expect(
        await db
          .select({ id: user.id, name: user.name })
          .from(user)
          .where(eq(user.email, credentials.email))
          .get(),
      ).toEqual({ id: "tablecast-partial-owner", name: "保持する名前" });
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
      await db.update(deploymentOwner).set({ seeded: 3 });
      await expect(seedPreviewDatabase(preview, credentials)).rejects.toThrow("組織作成後");
      await db.update(deploymentOwner).set({ seeded: 1 });
      // 旧固定URLを持つ既存previewでも、所属・営業データを再投入せず画像だけ更新する。
      const originalOwner = await db
        .select({ image: user.image })
        .from(user)
        .where(eq(user.id, "tablecast-partial-owner"))
        .get();
      const originalOrganisation = await db
        .select({ id: organization.id, logo: organization.logo })
        .from(organization)
        .innerJoin(stores, eq(stores.organization_id, organization.id))
        .where(eq(stores.id, "tablecast-komorebi"))
        .get();
      const migratedOrganisation = await db
        .select({ id: organization.id, logo: organization.logo })
        .from(organization)
        .innerJoin(stores, eq(stores.organization_id, organization.id))
        .where(eq(stores.id, "tablecast-hanul"))
        .get();
      if (!originalOwner?.image || !originalOrganisation?.logo || !migratedOrganisation?.logo)
        throw new Error("更新対象のデモ画像がありません。");
      const oldAdmin = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, "ren.tanaka@komorebi-shijo.com"))
        .get();
      if (!oldAdmin) throw new Error("旧スタッフの移行対象がありません。");
      await db.batch([
        db
          .update(user)
          .set({ email: "tablecast-member@example.test" })
          .where(eq(user.id, oldAdmin.id)),
        db
          .update(member)
          .set({ role: "member" })
          .where(
            and(eq(member.userId, oldAdmin.id), eq(member.organizationId, originalOrganisation.id)),
          ),
      ]);
      const oldOwnerIcon = legacyIdentityIconUrl("user", "tablecast-partial-owner");
      const credentialAccounts = await db
        .select()
        .from(account)
        .where(eq(account.providerId, "credential"));
      expect(credentialAccounts.length).toBeGreaterThan(0);
      await db.batch([
        db
          .update(user)
          .set({ image: oldOwnerIcon, email: "tablecast-owner@example.test" })
          .where(eq(user.id, "tablecast-partial-owner")),
        db.insert(account).values({
          id: "tablecast-migrated-google",
          issuer: "https://tablecast-google.localhost",
          accountId: "tablecast-owner@example.test",
          providerId: "google",
          userId: "tablecast-partial-owner",
          updatedAt: new Date(1),
        }),
        db
          .update(organization)
          .set({ logo: legacyIdentityIconUrl("store", "tablecast-komorebi") })
          .where(eq(organization.id, originalOrganisation.id)),
        db
          .update(organization)
          .set({ logo: legacyIdentityIconUrl("store", "tablecast-akari") })
          .where(eq(organization.id, migratedOrganisation.id)),
      ]);
      const ownerIconKey = `tablecast/avatars/${originalOwner.image.split("/").at(-1)}`;
      const ownerIconVersion = (await platform.env.TABLECAST_MEDIA.head(ownerIconKey))?.version;
      const refreshedImage = demoStores("smoke")[0]?.configuration.products[0]?.imageKey;
      if (!refreshedImage) throw new Error("再投入を確認する商品画像がありません。");
      await platform.env.TABLECAST_MEDIA.delete(refreshedImage);
      expect(await seedPreviewDatabase(preview, credentials)).toBe(false);
      expect(
        await db
          .select({ role: member.role })
          .from(member)
          .where(
            and(eq(member.userId, oldAdmin.id), eq(member.organizationId, originalOrganisation.id)),
          )
          .get(),
      ).toEqual({ role: "admin" });
      // 新メールへ移行後の手動変更は、通常の再seedで戻さない。
      await db
        .update(member)
        .set({ role: "member" })
        .where(
          and(eq(member.userId, oldAdmin.id), eq(member.organizationId, originalOrganisation.id)),
        );
      await seedPreviewDatabase(preview, credentials);
      expect(
        await db
          .select({ role: member.role })
          .from(member)
          .where(
            and(eq(member.userId, oldAdmin.id), eq(member.organizationId, originalOrganisation.id)),
          )
          .get(),
      ).toEqual({ role: "member" });
      await db
        .update(member)
        .set({ role: "admin" })
        .where(
          and(eq(member.userId, oldAdmin.id), eq(member.organizationId, originalOrganisation.id)),
        );

      expect(await db.select().from(account).where(eq(account.providerId, "credential"))).toEqual(
        credentialAccounts,
      );
      expect(
        await db
          .select({ id: user.id, email: user.email })
          .from(user)
          .where(eq(user.id, "tablecast-partial-owner"))
          .get(),
      ).toEqual({ id: "tablecast-partial-owner", email: credentials.email });
      expect(
        await db
          .select({ userId: account.userId, accountId: account.accountId })
          .from(account)
          .where(eq(account.id, "tablecast-migrated-google"))
          .get(),
      ).toEqual({ userId: "tablecast-partial-owner", accountId: credentials.email });
      expect(
        await db
          .select({ image: user.image })
          .from(user)
          .where(eq(user.id, "tablecast-partial-owner"))
          .get(),
      ).toEqual(originalOwner);
      expect(
        await db
          .select({ logo: organization.logo })
          .from(organization)
          .where(eq(organization.id, originalOrganisation.id))
          .get(),
      ).toEqual({ logo: originalOrganisation.logo });
      expect(
        await db
          .select({ logo: organization.logo })
          .from(organization)
          .where(eq(organization.id, migratedOrganisation.id))
          .get(),
      ).toEqual({ logo: migratedOrganisation.logo });
      expect((await platform.env.TABLECAST_MEDIA.head(ownerIconKey))?.version).toBe(
        ownerIconVersion,
      );
      expect(
        (await platform.env.TABLECAST_MEDIA.head(refreshedImage))?.httpMetadata?.contentType,
      ).toBe("image/webp");
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
      expect(products).toHaveLength(102);
      for (const product of products.filter((item) => item.imageKey))
        expect(product.imageKey).toMatch(/^tablecast\/images\/[a-f0-9]{64}\.webp$/);
      for (const product of products) {
        expect(product.imageKind).toBe("illustration");
        expect(product.allergens.note.ja).toMatch(/(?:混入|交差接触)は未確認/);
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
      const conversation = (
        await db
          .select({ data: tableEvents.data_json })
          .from(tableEvents)
          .where(eq(tableEvents.table_session_id, "tablecast-komorebi-table-02-session"))
          .orderBy(tableEvents.cursor)
      )
        .map((row) =>
          z
            .object({
              source: z.literal("synthetic-demo"),
              role: z.string().optional(),
              text: z.string().optional(),
              speaker: voiceTurnSchema.shape.speaker,
            })
            .parse(JSON.parse(row.data)),
        )
        .filter((line) => line.role === "user");
      expect(new Set(conversation.map((line) => line.speaker?.id))).toEqual(
        new Set([
          "tablecast-komorebi-table-02-session-synthetic-stream:0",
          "tablecast-komorebi-table-02-session-synthetic-stream:1",
          null,
        ]),
      );
      expect(conversation.some((line) => line.text?.includes("一つに訂正"))).toBe(true);
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
      expect(seededIcons.results.length).toBe(12);
      for (const { url } of seededIcons.results) {
        expect(url).toMatch(/^\/api\/avatars\/[a-f0-9-]+$/);
        const image = await platform.env.TABLECAST_MEDIA.get(
          `tablecast/avatars/${url?.split("/").at(-1)}`,
        );
        expect(image?.httpMetadata?.contentType).toBe("image/webp");
        if (!image) throw new Error("seed画像がありません。");
        const bytes = new Uint8Array(await image.arrayBuffer());
        expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
        expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe("WEBP");
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
      expect(await seedPreviewDatabase(preview, credentials)).toBe(false);
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
      const memberships = await db
        .select({ storeId: stores.id, role: member.role })
        .from(member)
        .innerJoin(stores, eq(stores.organization_id, member.organizationId));
      expect(memberships).toHaveLength(10);
      for (const storeId of ["tablecast-komorebi", "tablecast-hanul", "tablecast-koharu"])
        expect(
          memberships
            .filter((membership) => membership.storeId === storeId)
            .map((membership) => membership.role)
            .sort(),
        ).toEqual(
          storeId === "tablecast-koharu"
            ? ["admin", "member", "owner", "owner"]
            : ["admin", "member", "owner"],
        );
      const westwardOwners = await db
        .select({ email: user.email, role: member.role })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .innerJoin(stores, eq(stores.organization_id, member.organizationId))
        .where(and(eq(stores.id, "tablecast-koharu"), eq(member.role, "owner")));
      expect(westwardOwners.map((person) => person.email).sort()).toEqual(
        [credentials.otherEmail, "tsubasa.yamamoto@westward-burgers-kyoto.com"].sort(),
      );
      expect(await db.get(sql`SELECT COUNT(*) count FROM team`)).toEqual({ count: 0 });
      expect(repeated).toEqual(counts);
      expect(
        await db
          .select({ cart_version: tableSessions.cart_version })
          .from(tableSessions)
          .where(eq(tableSessions.id, reserved))
          .get(),
      ).toEqual({ cart_version: 17 });
      // 移行先が別ユーザーとして存在しても、自動で統合や削除をしない。
      await db.insert(user).values({
        id: "tablecast-email-conflict",
        email: "tablecast-owner@example.test",
        name: "保持する競合ユーザー",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await expect(seedPreviewDatabase(preview, credentials)).rejects.toThrow("移行先");
      expect(
        await db
          .select({ email: user.email })
          .from(user)
          .where(eq(user.id, "tablecast-email-conflict"))
          .get(),
      ).toEqual({ email: "tablecast-owner@example.test" });
      expect(
        await db.select({ email: user.email }).from(user).where(eq(user.id, owner.id)).get(),
      ).toEqual({ email: credentials.email });
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
