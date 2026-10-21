import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import app from "../src/app";
import { confirmations, orders, tableSessions } from "../src/db/table-schema";
import { updateCart } from "../src/modules/orders/use-cases/cart";
import { prepareConfirmation } from "../src/modules/orders/use-cases/confirmation";
import { submitOrder } from "../src/modules/orders/use-cases/submit";
import { createApiServices } from "../src/platform/context";
import { tableStateSchema } from "../src/schema";
import { fixtureDb, insertFixture } from "./database-fixture";
import { device, deviceToken, setupFixture, text } from "./fixture";
import { measuredDatabase } from "./measured-database";

it.each([1, 100])("%i件の注文履歴を実HTTPで取得し全件・金額・プランの集計を保つ", async (count) => {
  await setupFixture();
  const services = createApiServices(env);
  await updateCart(services, device, {
    expectedVersion: 0,
    lines: [{ id: "tablecast-read-line", productId: "tea", quantity: 1, selections: [] }],
  });
  const snapshot = await prepareConfirmation(services, device, {
    expectedVersion: 1,
    channel: "gui",
  });
  await submitOrder(services, device, {
    snapshotId: snapshot.id,
    idempotencyKey: "tablecast-read-first",
    approved: true,
  });
  const row = await fixtureDb.select().from(orders).get();
  if (!row) throw new Error("注文fixtureがありません");
  const confirmation = await fixtureDb.select().from(confirmations).get();
  if (!confirmation) throw new Error("確認fixtureがありません");
  if (count > 1)
    await env.TABLECAST_DB.batch(
      Array.from({ length: count - 1 }, (_, index) => [
        insertFixture(confirmations, { ...confirmation, id: `tablecast-read-snapshot-${index}` }),
        insertFixture(orders, {
          ...row,
          id: `tablecast-read-${index}`,
          snapshot_id: `tablecast-read-snapshot-${index}`,
          idempotency_key: `tablecast-read-key-${index}`,
        }),
      ]).flat(),
    );
  await fixtureDb
    .update(tableSessions)
    .set({
      plan_json: JSON.stringify({
        id: "tablecast-read-plan",
        startedAt: Date.now(),
        rules: {
          id: "tablecast-read-plan",
          text: text("プラン", "Plan"),
          pricePerPerson: 1800,
          durationMinutes: 90,
          lastOrderMinutesBeforeEnd: 10,
          productIds: ["coffee"],
          categoryIds: [],
          tags: [],
          maxPerOrder: 4,
          maxTotalPerPerson: 10,
          intervalSeconds: 30,
          excludedOptionIds: [],
          includedOptionSurcharge: true,
        },
      }),
    })
    .where(eq(tableSessions.id, device.tableSessionId));
  for (let sample = 0; sample < 31; sample++) {
    const measured = measuredDatabase(env.TABLECAST_DB);
    const context = createExecutionContext();
    const started = performance.now();
    const response = await app.request(
      "/api/table",
      { headers: { Cookie: `tablecast.device=${deviceToken}` } },
      { ...env, TABLECAST_DB: measured.database },
      context,
    );
    const body = await response.text();
    const elapsedMs = performance.now() - started;
    await waitOnExecutionContext(context);
    expect(response.status).toBe(200);
    const state = tableStateSchema.parse(JSON.parse(body));
    expect(state.orders).toHaveLength(count);
    expect(state.bill.orderedTotal).toBe(count * 400);
    expect(state.plan?.id).toBe("tablecast-read-plan");
    expect(measured.stats.roundtrips).toBeLessThanOrEqual(2);
    expect(measured.stats.statements).toBeLessThanOrEqual(8);
    console.info(
      "tablecast.table.read.performance",
      JSON.stringify({
        count,
        sample,
        elapsedMs,
        ...measured.stats,
        ...measured.timing,
        batches: measured.batches,
        bytes: new TextEncoder().encode(body).byteLength,
      }),
    );
  }
});
