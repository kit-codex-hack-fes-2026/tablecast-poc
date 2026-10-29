import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq, sql } from "drizzle-orm";
import { afterEach, expect, inject, it, vi } from "vitest";
import { posCheckouts, posConnections } from "../src/db/pos-schema";
import { orders, payments, tableSessions } from "../src/db/table-schema";
import { posCheckoutViewSchema } from "../src/modules/pos/model";
import { fixtureDb } from "./database-fixture";
import { deviceToken, resetFixtureStorage } from "./fixture";
import { checkoutPath, request, setupPosFixture, squareHttp } from "./pos-fixture";

afterEach(() => vi.restoreAllMocks());

function posRows() {
  return fixtureDb.batch([
    fixtureDb.select().from(posConnections),
    fixtureDb.select().from(posCheckouts),
    fixtureDb.select().from(tableSessions),
    fixtureDb.select().from(orders),
  ]);
}

it("旧0033のPOSと進行中会計を保って言語migrationと0034を適用し、同じ会計を精算する", async () => {
  await resetFixtureStorage();
  const migrations = inject("tablecastMigrations");
  const languageIndex = migrations.findIndex((migration) =>
    migration.name.includes("0033_tablecast_content_languages"),
  );
  const pos = migrations.find((migration) => migration.name.includes("0034_tablecast_pos"));
  if (languageIndex < 1 || !pos) throw new Error("言語とPOSのmigrationがありません");
  await applyD1Migrations(env.TABLECAST_DB, migrations.slice(0, languageIndex));
  await applyD1Migrations(env.TABLECAST_DB, [
    {
      name: "0033_tablecast_pos.sql",
      queries: pos.queries.map((query) => query.replaceAll(" IF NOT EXISTS", "")),
    },
  ]);
  const { cookie, table } = await setupPosFixture();
  const provider = squareHttp();
  const started = await request(checkoutPath + "/start", cookie, "POST", {
    expectedVersion: table.cart.version,
    idempotencyKey: "tablecast-pos-migration-recovery",
  });
  expect(started.status).toBe(200);
  expect(posCheckoutViewSchema.parse(await started.json())).toMatchObject({
    locked: true,
    checkout: { status: "pending" },
  });
  const before = await posRows();

  await applyD1Migrations(env.TABLECAST_DB, migrations.slice(languageIndex));

  expect(await posRows()).toEqual(before);
  expect(await fixtureDb.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
  await fixtureDb
    .update(tableSessions)
    .set({ locale: "ko" })
    .where(eq(tableSessions.id, "tablecast-session"));
  const cart = await request("/api/table/cart", `tablecast.device=${deviceToken}`, "PUT", {
    expectedVersion: table.cart.version,
    lines: [{ id: "migration-new-order", productId: "tea", quantity: 1, selections: [] }],
  });
  expect(cart.status).toBe(409);
  expect(await cart.json()).toMatchObject({ error: { code: "POS_CHECKOUT_LOCKED" } });
  provider.state.completed = true;
  const reconciled = await request(checkoutPath + "/reconcile", cookie, "POST");
  expect(reconciled.status).toBe(200);
  expect(posCheckoutViewSchema.parse(await reconciled.json())).toMatchObject({
    locked: false,
    checkout: { status: "completed" },
  });
  expect(await fixtureDb.select().from(payments)).toMatchObject([
    { amount: 400, reason: "Square" },
  ]);
  expect(await fixtureDb.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
});
