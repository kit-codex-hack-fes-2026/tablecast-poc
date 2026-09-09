import type { D1Migration } from "@cloudflare/vitest-plugin";
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, inject } from "vitest";
import { resetFixtureStorage } from "./fixture";
declare module "vitest" {
  export interface ProvidedContext {
    tablecastMigrations: D1Migration[];
  }
}
beforeEach(async () => {
  await resetFixtureStorage();
  await applyD1Migrations(env.TABLECAST_DB, inject("tablecastMigrations"));
});
