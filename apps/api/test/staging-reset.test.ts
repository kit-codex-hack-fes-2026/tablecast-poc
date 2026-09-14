import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { sql } from "drizzle-orm";
import { expect, test } from "vitest";
import { resetStagingDatabase } from "../../../scripts/tablecast-staging-reset";
import { deploymentOwner, stores } from "../src/db/business-schema";
import { session, user } from "../src/db/auth-schema";
import { setupFixture } from "./fixture";
import { createAuth } from "../src/modules/auth/service";

const staging = {
  ...env,
  TABLECAST_ENV: "staging",
  TABLECAST_PUBLIC_ORIGIN: "https://tablecast-staging.kit-codex.workers.dev",
};

test("全体リセットは店・ユーザー・認証を消去し所有台帳を保持して繰り返せる", async () => {
  const { cookie } = await setupFixture();
  const db = drizzle(env.TABLECAST_DB);
  await db.run(
    sql`CREATE TABLE IF NOT EXISTS tablecast_deployment_owner(repository TEXT NOT NULL, environment TEXT NOT NULL, seeded INTEGER NOT NULL DEFAULT 0)`,
  );
  await db.insert(deploymentOwner).values({
    repository: "kit-codex-hack-fes-2026/tablecast-poc",
    environment: "tablecast-staging",
    seeded: 1,
  });
  expect((await db.select().from(stores)).length).toBeGreaterThan(0);
  expect((await db.select().from(session)).length).toBeGreaterThan(0);
  await resetStagingDatabase(staging);
  expect(await db.select().from(stores)).toEqual([]);
  expect(await db.select().from(user)).toEqual([]);
  expect(await db.select().from(session)).toEqual([]);
  expect((await db.select().from(deploymentOwner))[0]).toMatchObject({
    environment: "tablecast-staging",
    seeded: 0,
  });
  expect(await createAuth(env).api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
  await resetStagingDatabase(staging);
});

test("本番・previewや所有者が異なるDBをリセットしない", async () => {
  await setupFixture();
  const db = drizzle(env.TABLECAST_DB);
  await expect(resetStagingDatabase({ ...staging, TABLECAST_ENV: "production" })).rejects.toThrow(
    "staging以外",
  );
  await expect(resetStagingDatabase({ ...staging, TABLECAST_ENV: "preview" })).rejects.toThrow(
    "staging以外",
  );
  await db.run(
    sql`CREATE TABLE IF NOT EXISTS tablecast_deployment_owner(repository TEXT NOT NULL, environment TEXT NOT NULL, seeded INTEGER NOT NULL DEFAULT 0)`,
  );
  await db
    .insert(deploymentOwner)
    .values({ repository: "other/repo", environment: "tablecast-staging", seeded: 1 });
  await expect(resetStagingDatabase(staging)).rejects.toThrow("所有情報");
  expect((await db.select().from(stores)).length).toBeGreaterThan(0);
});
