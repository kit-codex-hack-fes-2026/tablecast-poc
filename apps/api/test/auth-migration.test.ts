import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { hashPassword } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { expect, inject, it } from "vitest";
import { account, user } from "../src/db/auth-schema";
import { createAuth } from "../src/modules/auth/service";
import { fixtureDb } from "./database-fixture";
import { resetFixtureStorage } from "./fixture";

it("認証のissuer必須制約を外しても既存の資格情報とログインを保持する", async () => {
  await resetFixtureStorage();
  const migrations = inject("tablecastMigrations");
  const index = migrations.findIndex((migration) =>
    migration.name.includes("0025_tablecast_auth_account_compat"),
  );
  if (index < 1) throw new Error("認証互換migrationが必要です");
  await applyD1Migrations(env.TABLECAST_DB, migrations.slice(0, index));
  const email = "tablecast-auth-migration@example.test";
  const password = "tablecast-auth-migration-password";
  await fixtureDb.insert(user).values({
    id: "tablecast-auth-migration-user",
    email,
    emailVerified: true,
    name: "移行会員",
  });
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

  expect(await fixtureDb.select().from(account)).toEqual(before);
  expect(await fixtureDb.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
  const auth = createAuth(env);
  const response = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.getSetCookie().join(";")).toContain("session_token");
});
