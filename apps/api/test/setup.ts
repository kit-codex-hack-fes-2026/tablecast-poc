import { applyD1Migrations } from "cloudflare:test";
import { resetFixtureStorage } from "./fixture";
import { env } from "cloudflare:workers";
import { beforeEach, inject } from "vitest";
import type { D1Migration } from "@cloudflare/vitest-plugin";
declare module "vitest" {
  export interface ProvidedContext {
    tablecastMigrations: D1Migration[];
  }
}
beforeEach(async () => {
  await resetFixtureStorage();
  await applyD1Migrations(env.TABLECAST_DB, inject("tablecastMigrations"));
});
