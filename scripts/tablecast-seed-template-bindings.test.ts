import { createAuth } from "@tablecast/api/bootstrap";
import { business, createDatabase, type Database, identity } from "@tablecast/api/db";
import { eq, sql } from "drizzle-orm";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";
import type { DemoCredentials } from "./tablecast-seed.ts";
import { type SeedEnv, seedPreviewDatabase } from "./tablecast-seed-data.ts";
import { createSeedTemplate } from "./tablecast-seed-template.ts";

const execute = promisify(execFile);

async function seedDatabase(directory: string, pr: number) {
  await mkdir(directory, { recursive: true });
  const configPath = join(directory, "wrangler.json");
  const state = join(directory, "state");
  const name = `tablecast-seed-template-test-${pr}`;
  const databaseId = "00000000-0000-4000-8000-000000000003";
  await writeFile(
    configPath,
    JSON.stringify({
      name,
      compatibility_date: "2026-09-03",
      compatibility_flags: ["nodejs_compat"],
      vars: {
        TABLECAST_ENV: "preview",
        TABLECAST_PUBLIC_ORIGIN: `https://tablecast-pr-${pr}.kit-codex.workers.dev`,
        TABLECAST_AUTH_SECRET: `${name}-secret-not-used-in-deployment`,
      },
      d1_databases: [{ binding: "TABLECAST_DB", database_name: name, database_id: databaseId }],
      r2_buckets: [{ binding: "TABLECAST_MEDIA", bucket_name: `${name}-media` }],
    }),
  );
  const migrations = execute(
    process.execPath,
    [
      resolve("scripts/tablecast-cf-local.ts"),
      "d1",
      "migrations",
      "apply",
      databaseId,
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
  const platform = await getPlatformProxy<SeedEnv>({
    configPath,
    envFiles: [],
    persist: { path: join(state, "v3") },
    remoteBindings: false,
  });
  try {
    const db = createDatabase(platform.env.TABLECAST_DB);
    await db.run(
      sql`CREATE TABLE tablecast_deployment_owner(repository TEXT NOT NULL, environment TEXT NOT NULL, seeded INTEGER NOT NULL)`,
    );
    await db.insert(business.deploymentOwner).values({
      repository: "kit-codex-hack-fes-2026/tablecast-poc",
      environment: `tablecast-pr-${pr}`,
      seeded: 0,
    });
    return { platform, db, env: platform.env };
  } catch (error) {
    await platform.dispose();
    throw error;
  }
}

async function stableSeed(db: Database, baseTime: number) {
  const [users, organisations, members, stores, releases, tables] = await db.batch([
    db.select().from(identity.user).orderBy(identity.user.id),
    db.select().from(identity.organization).orderBy(identity.organization.id),
    db.select().from(identity.member).orderBy(identity.member.id),
    db.select().from(business.stores).orderBy(business.stores.id),
    db
      .select()
      .from(business.configReleases)
      .orderBy(business.configReleases.store_id, business.configReleases.version),
    db.select().from(business.restaurantTables).orderBy(business.restaurantTables.id),
  ]);
  return {
    users: users.map((person) => ({
      ...person,
      createdAt: person.createdAt.getTime() - baseTime,
      updatedAt: person.updatedAt.getTime() - baseTime,
    })),
    organisations: organisations.map((organisation) => ({
      ...organisation,
      createdAt: organisation.createdAt.getTime() - baseTime,
    })),
    members: members.map((member) => ({
      ...member,
      createdAt: member.createdAt.getTime() - baseTime,
    })),
    stores: stores.map((store) => ({ ...store, updated_at: store.updated_at - baseTime })),
    releases: releases.map((release) => ({
      ...release,
      created_at: release.created_at - baseTime,
    })),
    tables,
  };
}

async function currentTimes(db: Database, baseTime: number) {
  const [sessions, orders, confirmations] = await db.batch([
    db
      .select({
        id: business.tableSessions.id,
        openedAt: business.tableSessions.opened_at,
        closedAt: business.tableSessions.closed_at,
      })
      .from(business.tableSessions)
      .orderBy(business.tableSessions.id),
    db
      .select({
        id: business.orders.id,
        createdAt: business.orders.created_at,
        updatedAt: business.orders.updated_at,
      })
      .from(business.orders)
      .orderBy(business.orders.id),
    db
      .select({
        id: business.confirmations.id,
        createdAt: business.confirmations.created_at,
        expiresAt: business.confirmations.expires_at,
      })
      .from(business.confirmations)
      .orderBy(business.confirmations.id),
  ]);
  return {
    sessions: sessions.map((session) => ({
      ...session,
      openedAt: session.openedAt - baseTime,
      closedAt: session.closedAt === null ? null : session.closedAt - baseTime,
    })),
    orders: orders.map((order) => ({
      ...order,
      createdAt: order.createdAt - baseTime,
      updatedAt: order.updatedAt - baseTime,
    })),
    confirmations: confirmations.map((confirmation) => ({
      ...confirmation,
      createdAt: confirmation.createdAt - baseTime,
      expiresAt: confirmation.expiresAt - baseTime,
    })),
  };
}

it("同じ固定seedを実D1へ原子的に投入し、基礎データを揃えて資格情報と営業時刻を環境ごとに生成する", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tablecast-seed-template-bindings-"));
  const platforms: { dispose(): Promise<void> }[] = [];
  const credentials: DemoCredentials = {
    email: "haruka.sato@komorebi-shijo.com",
    otherEmail: "tsubasa.yamamoto@westward-burgers-kyoto.com",
    baseTime: Date.UTC(2026, 8, 6, 0),
    profile: "demo",
  };
  const otherCredentials: DemoCredentials = {
    ...credentials,
    baseTime: credentials.baseTime + 7 * 86_400_000,
  };
  try {
    const first = await seedDatabase(join(directory, "first"), 701);
    platforms.push(first.platform);
    const second = await seedDatabase(join(directory, "second"), 702);
    platforms.push(second.platform);
    const template = await createSeedTemplate();

    // 親子行の途中で失敗しても、認証ユーザーと店舗を残さず再開できる。
    await first.db.run(
      sql`CREATE TRIGGER tablecast_seed_template_reject BEFORE INSERT ON organization BEGIN SELECT RAISE(ABORT, 'tablecast-seed-template-reject'); END`,
    );
    await expect(seedPreviewDatabase(first.env, credentials, template)).rejects.toThrow(
      "tablecast-seed-template-reject",
    );
    expect(
      await first.db.batch([
        first.db.select().from(identity.user),
        first.db.select().from(identity.account),
        first.db.select().from(identity.organization),
        first.db.select().from(identity.member),
        first.db.select().from(business.stores),
        first.db.select().from(business.restaurantTables),
      ]),
    ).toEqual([[], [], [], [], [], []]);
    expect(await first.db.select().from(business.deploymentOwner).get()).toMatchObject({
      seeded: 0,
    });
    await first.db.run(sql`DROP TRIGGER tablecast_seed_template_reject`);

    expect(await seedPreviewDatabase(first.env, credentials, template)).toBe(true);
    expect(await seedPreviewDatabase(second.env, otherCredentials, template)).toBe(true);
    const firstBase = await stableSeed(first.db, credentials.baseTime);
    expect(await stableSeed(second.db, otherCredentials.baseTime)).toEqual(firstBase);
    expect(firstBase.users).toHaveLength(8);
    expect(firstBase.organisations).toHaveLength(3);
    expect(firstBase.members).toHaveLength(9);
    expect(firstBase.stores).toHaveLength(3);
    expect(firstBase.releases).toHaveLength(3);
    expect(firstBase.tables).toHaveLength(36);

    const firstTimes = await currentTimes(first.db, credentials.baseTime);
    expect(await currentTimes(second.db, otherCredentials.baseTime)).toEqual(firstTimes);
    expect(firstTimes.sessions).toHaveLength(33);
    expect(firstTimes.orders).toHaveLength(15);
    expect(
      firstTimes.sessions.find((session) => session.id === "tablecast-komorebi-table-01-session"),
    ).toMatchObject({ openedAt: -180_000 });
    expect(
      firstTimes.orders.find(
        (order) => order.id === "tablecast-komorebi-table-04-session-confirmation-1-order",
      ),
    ).toMatchObject({ createdAt: -718_000 });
    expect(
      firstTimes.confirmations.find(
        (confirmation) => confirmation.id === "tablecast-komorebi-table-03-session-confirmation-1",
      ),
    ).toMatchObject({ expiresAt: 120_000 });

    const [firstAccounts, secondAccounts] = await Promise.all([
      first.db.select().from(identity.account).orderBy(identity.account.id),
      second.db.select().from(identity.account).orderBy(identity.account.id),
    ]);
    expect(firstAccounts).toEqual([]);
    expect(secondAccounts).toEqual([]);

    for (const [database, current] of [
      [first, credentials],
      [second, otherCredentials],
    ] as const) {
      expect(await database.db.select().from(business.deploymentOwner).get()).toMatchObject({
        seeded: 2,
      });
      expect(
        await database.db.batch([
          database.db.select().from(identity.session),
          database.db.select().from(identity.verification),
          database.db.select().from(identity.jwks),
          database.db.select().from(identity.oauthAccessToken),
          database.db.select().from(identity.oauthRefreshToken),
        ]),
      ).toEqual([[], [], [], [], []]);
      expect(await database.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
      const auth = createAuth({ ...database.env, TABLECAST_ENV: "production" });
      for (const email of [current.email, current.otherEmail]) {
        const response = await auth.handler(
          new Request(`${database.env.TABLECAST_PUBLIC_ORIGIN}/api/auth/sign-in/email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: database.env.TABLECAST_PUBLIC_ORIGIN,
            },
            body: JSON.stringify({ email, password: "tablecast-retired-test-password" }),
          }),
        );
        expect(response.status).toBe(403);
        expect(response.headers.getSetCookie().join(";")).not.toContain("tablecast.session_token");
      }
    }

    // 完了済みの再配備は、編集した店舗・注文・追加したGoogle連携を成果物で戻さない。
    const owner = firstBase.users.find((person) => person.email === credentials.email);
    if (!owner) throw new Error("初期投入した管理者がありません。");
    const orderId = "tablecast-komorebi-table-04-session-confirmation-1-order";
    await first.db.batch([
      first.db.update(business.deploymentOwner).set({ seeded: 1 }),
      first.db
        .update(business.stores)
        .set({ name: "営業中に変更した店舗名" })
        .where(eq(business.stores.id, "tablecast-komorebi")),
      first.db
        .update(business.orders)
        .set({ status: "accepted", updated_at: credentials.baseTime })
        .where(eq(business.orders.id, orderId)),
      first.db.insert(identity.account).values({
        id: "tablecast-template-linked-google",
        accountId: "tablecast-template-google-subject",
        providerId: "google",
        userId: owner.id,
        updatedAt: new Date(credentials.baseTime),
      }),
    ]);
    const before = await first.db.batch([
      first.db.select().from(business.stores),
      first.db.select().from(business.orders),
      first.db.select().from(identity.account),
    ]);
    expect(before[2]).toEqual([
      expect.objectContaining({ providerId: "google", userId: owner.id, password: null }),
    ]);
    expect(
      await seedPreviewDatabase(
        first.env,
        { ...otherCredentials, baseTime: otherCredentials.baseTime + 86_400_000 },
        template,
      ),
    ).toBe(false);
    expect(
      await first.db.batch([
        first.db.select().from(business.stores),
        first.db.select().from(business.orders),
        first.db.select().from(identity.account),
      ]),
    ).toEqual(before);
    expect(await first.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
  } finally {
    try {
      await Promise.all(platforms.map((platform) => platform.dispose()));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}, 60_000);
