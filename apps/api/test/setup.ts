import { applyD1Migrations, reset } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, inject } from "vitest";
import type { D1Migration } from "@cloudflare/vitest-plugin";
declare module "vitest" {
  export interface ProvidedContext {
    tablecastMigrations: D1Migration[];
  }
}
beforeEach(async () => {
  await reset();
  await applyD1Migrations(env.TABLECAST_DB, inject("tablecastMigrations"));
});
