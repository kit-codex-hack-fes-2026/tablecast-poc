import { hashPassword } from "better-auth/crypto";
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { sql } from "drizzle-orm";
import { expect, inject, it } from "vitest";
import { account } from "../src/db/identity-schema";
import { createAuth } from "../src/modules/auth/service";
import { authPost } from "./auth-fixture";
import { fixtureDb } from "./database-fixture";
import { resetFixtureStorage } from "./fixture";

it("パスワード廃止の移行は既存アカウントを維持してハッシュを消去する", async () => {
  await resetFixtureStorage();
  const migrations = inject("tablecastMigrations");
  const index = migrations.findIndex((migration) =>
    migration.name.includes("0025_tablecast_auth_account_compat"),
  );
  if (index < 1) throw new Error("認証互換migrationが必要です");
  await applyD1Migrations(env.TABLECAST_DB, migrations.slice(0, index));
  const email = "tablecast-auth-migration@example.test";
  const password = "tablecast-auth-migration-password";
  // 0026のStripe列がない旧userの実物を再現する。
  await fixtureDb.run(
    sql`INSERT INTO user(id,email,email_verified,name,created_at,updated_at) VALUES ('tablecast-auth-migration-user',${email},1,'移行会員',1,1)`,
  );
  await fixtureDb.insert(account).values({
    id: "tablecast-auth-migration-account",
    userId: "tablecast-auth-migration-user",
    issuer: "local:credential",
    providerId: "credential",
    accountId: "tablecast-auth-migration-user",
    password: await hashPassword(password),
  });
  const before = await fixtureDb.select().from(account);

  await applyD1Migrations(env.TABLECAST_DB, migrations.slice(index));

  expect(await fixtureDb.select().from(account)).toEqual(
    before.map((row) => ({ ...row, password: null })),
  );
  expect(await fixtureDb.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
  const auth = createAuth(env);
  const response = await authPost(auth, "/sign-in/email", { email, password });
  expect(response.status).toBe(403);
  expect(response.headers.getSetCookie().join(";")).not.toContain("session_token");
});

it("異なるissuerで識別子が重複する場合は既存行と必須制約を保持して移行を拒否する", async () => {
  await resetFixtureStorage();
  const migrations = inject("tablecastMigrations");
  const index = migrations.findIndex((migration) =>
    migration.name.includes("0025_tablecast_auth_account_compat"),
  );
  if (index < 1) throw new Error("認証互換migrationが必要です");
  await applyD1Migrations(env.TABLECAST_DB, migrations.slice(0, index));
  // 0026適用前の列だけを使い、旧認証schemaを再現する。
  await fixtureDb.run(
    sql`INSERT INTO user(id,email,email_verified,name,created_at,updated_at) VALUES ('tablecast-auth-duplicate-user','tablecast-auth-duplicate@example.test',0,'識別子重複会員',1,1)`,
  );
  await fixtureDb.insert(account).values(
    ["https://first.example.test", "https://second.example.test"].map((issuer, position) => ({
      id: `tablecast-auth-duplicate-account-${position}`,
      userId: "tablecast-auth-duplicate-user",
      issuer,
      providerId: "google",
      accountId: "tablecast-auth-duplicate-identity",
    })),
  );
  const before = await fixtureDb.select().from(account);

  await expect(applyD1Migrations(env.TABLECAST_DB, migrations.slice(index))).rejects.toThrow(
    /UNIQUE constraint failed: account.provider_id, account.account_id/,
  );

  expect(await fixtureDb.select().from(account)).toEqual(before);
  expect(await fixtureDb.all(sql`PRAGMA table_info(account)`)).toContainEqual(
    expect.objectContaining({ name: "issuer", notnull: 1 }),
  );
  expect(await fixtureDb.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
});
