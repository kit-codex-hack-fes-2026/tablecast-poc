import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { confirmations, orders, tableEvents, tableSessions } from "../src/db/table-schema";
import { createDemo } from "../src/modules/demo/service";
import { updateCart } from "../src/modules/orders/use-cases/cart";
import { prepareConfirmation, submitOrder } from "../src/modules/orders/use-cases/confirmation";
import { getCoreState } from "../src/modules/tables/core-queries";
import { getTableState } from "../src/modules/tables/queries";
import app from "../src/ordering-app";
import { createApiServices } from "../src/platform/context";
import {
  coreStateSchema,
  orderPageSchema,
  submittedCoreOrderSchema,
  tablePlanSchema,
} from "../src/schema";
import { fixtureDb, insertFixture } from "./database-fixture";
import { device, deviceToken, setupFixture, text } from "./fixture";
import { measuredDatabase } from "./measured-database";

it.each(["table", "demo"] as const)(
  "%sの軽量応答は完全応答と同じ価格・版を返し、更新後の再照会を増やさない",
  async (kind) => {
    const { staff, cookie } = await setupFixture();
    const demo = kind === "demo" ? await createDemo(createApiServices(env), staff) : undefined;
    const actor = demo ? { ...staff, demoId: demo.id, tableSessionId: demo.id } : device;
    const base = demo ? `/api/admin/stores/${staff.storeId}/demo/${demo.id}/table` : "/api/table";
    const headers = {
      Cookie: demo ? cookie : `tablecast.device=${deviceToken}`,
      "Content-Type": "application/json",
    };
    const context = createExecutionContext();
    try {
      const measured = measuredDatabase(env.TABLECAST_DB);
      const response = await app.request(
        `${base}/cart?view=core`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({
            expectedVersion: 0,
            lines: [{ id: "tablecast-core-line", productId: "tea", quantity: 2, selections: [] }],
          }),
        },
        { ...env, TABLECAST_DB: measured.database },
        context,
      );
      expect(response.status).toBe(200);
      const raw: unknown = await response.json();
      expect(raw).not.toHaveProperty("orders");
      expect(raw).not.toHaveProperty("events");
      const core = coreStateSchema.parse(raw);
      expect(core.cart).toMatchObject({ version: 1, total: 800 });
      expect(measured.stats.roundtrips).toBeLessThanOrEqual(kind === "table" ? 2 : 3);
      const full = await getTableState(createApiServices(env), actor);
      const { orders: history, events, ...expected } = full;
      expect(history).toEqual([]);
      expect(events.some((event) => event.kind === "cart.updated")).toBe(true);
      expect(core).toEqual(expected);
      const confirmation = await prepareConfirmation(createApiServices(env), actor, {
        channel: "gui",
        expectedVersion: 1,
      });
      const submitted = await app.request(
        `${base}/orders?view=core`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            snapshotId: confirmation.id,
            idempotencyKey: "tablecast-core-order",
            approved: true,
          }),
        },
        env,
        context,
      );
      expect(submitted.status).toBe(200);
      const result = submittedCoreOrderSchema.parse(await submitted.json());
      expect(result.order.total).toBe(800);
      expect(result.state.cart).toMatchObject({ version: 2, lines: [], total: 0 });
      expect(result.state.bill).toMatchObject({ orderedTotal: 800, due: 800 });
      const repeated = await app.request(
        `${base}/orders?view=core`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            snapshotId: confirmation.id,
            idempotencyKey: "tablecast-core-order",
            approved: true,
          }),
        },
        env,
        context,
      );
      expect(repeated.status).toBe(200);
      expect(submittedCoreOrderSchema.parse(await repeated.json()).order.id).toBe(result.order.id);
    } finally {
      await waitOnExecutionContext(context);
    }
  },
);

it("軽量な会計とプラン使用量は取消・却下を除き、snapshot全件を返さず完全状態と一致する", async () => {
  await setupFixture();
  const services = createApiServices(env);
  const plan = tablePlanSchema.parse({
    id: "tablecast-core-plan",
    startedAt: Date.now() - 60000,
    rules: {
      id: "tablecast-core-plan",
      text: text("飲み放題", "Drinks plan"),
      pricePerPerson: 1800,
      durationMinutes: 90,
      lastOrderMinutesBeforeEnd: 10,
      productIds: ["tea"],
      categoryIds: [],
      tags: [],
      maxPerOrder: 10,
      maxTotalPerPerson: 10,
      intervalSeconds: 0,
      excludedOptionIds: [],
      includedOptionSurcharge: false,
    },
  });
  await fixtureDb
    .update(tableSessions)
    .set({ plan_json: JSON.stringify(plan) })
    .where(eq(tableSessions.id, device.tableSessionId));
  for (let i = 0; i < 3; i++) {
    const cart = await updateCart(services, device, {
      expectedVersion: i * 2,
      lines: [{ id: `tablecast-core-${i}`, productId: "tea", quantity: 2, selections: [] }],
    });
    const snapshot = await prepareConfirmation(services, device, {
      expectedVersion: cart.cart.version,
      channel: "gui",
    });
    const order = await submitOrder(services, device, {
      snapshotId: snapshot.id,
      idempotencyKey: `tablecast-core-${i}`,
      approved: true,
    });
    if (i)
      await fixtureDb
        .update(orders)
        .set({ status: i === 1 ? "cancelled" : "rejected" })
        .where(eq(orders.id, order.id));
  }
  const core = await getCoreState(services, device);
  const { orders: history, events, ...expected } = await getTableState(services, device);
  expect(history).toHaveLength(3);
  expect(events.length).toBeGreaterThan(3);
  expect(core).toEqual(expected);
  expect(core.bill).toMatchObject({ planTotal: 3600, due: 3600 });
  const measured = measuredDatabase(env.TABLECAST_DB);
  const context = createExecutionContext();
  try {
    const response = await app.request(
      "/api/table/cart?view=core",
      {
        method: "PUT",
        headers: { Cookie: `tablecast.device=${deviceToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: 6,
          lines: [{ id: "tablecast-plan-http", productId: "tea", quantity: 1, selections: [] }],
        }),
      },
      { ...env, TABLECAST_DB: measured.database },
      context,
    );
    expect(response.status).toBe(200);
    expect(coreStateSchema.parse(await response.json()).cart.total).toBe(0);
    expect(measured.stats.roundtrips).toBe(2);
  } finally {
    await waitOnExecutionContext(context);
  }
});

it("注文履歴は同じ時刻でも重複なくページを進み、空と不正cursorを区別する", async () => {
  await setupFixture();
  const services = createApiServices(env);
  for (let i = 0; i < 3; i++) {
    const cart = await updateCart(services, device, {
      expectedVersion: i * 2,
      lines: [{ id: "tablecast-page-line", productId: "tea", quantity: 1, selections: [] }],
    });
    const snapshot = await prepareConfirmation(services, device, {
      expectedVersion: cart.cart.version,
      channel: "gui",
    });
    await submitOrder(services, device, {
      snapshotId: snapshot.id,
      idempotencyKey: `tablecast-page-${i}`,
      approved: true,
    });
  }
  await fixtureDb.update(orders).set({ created_at: 123 });
  const context = createExecutionContext();
  const headers = { Cookie: `tablecast.device=${deviceToken}` };
  try {
    const first = await app.request("/api/table/orders?limit=2", { headers }, env, context);
    expect(first.status).toBe(200);
    const page = orderPageSchema.parse(await first.json());
    expect(page.orders).toHaveLength(2);
    expect(page.nextCursor).not.toBeNull();
    const next = await app.request(
      `/api/table/orders?limit=2&beforeCreatedAt=${page.nextCursor?.createdAt}&beforeId=${page.nextCursor?.id}`,
      { headers },
      env,
      context,
    );
    const rest = orderPageSchema.parse(await next.json());
    expect(rest.orders).toHaveLength(1);
    expect(rest.nextCursor).toBeNull();
    expect(new Set([...page.orders, ...rest.orders].map((order) => order.id)).size).toBe(3);
    expect(
      (await app.request("/api/table/orders?beforeCreatedAt=123", { headers }, env, context))
        .status,
    ).toBe(400);
  } finally {
    await waitOnExecutionContext(context);
  }
});

it("履歴とイベントを100件増やしても同じカゴ操作のcore本文は増大せず、全履歴は互換経路に残る", async () => {
  await setupFixture();
  const services = createApiServices(env);
  const cart = await updateCart(services, device, {
    expectedVersion: 0,
    lines: [{ id: "tablecast-bounded-line", productId: "tea", quantity: 1, selections: [] }],
  });
  const snapshot = await prepareConfirmation(services, device, {
    expectedVersion: cart.cart.version,
    channel: "gui",
  });
  await submitOrder(services, device, {
    snapshotId: snapshot.id,
    idempotencyKey: "tablecast-bounded-order",
    approved: true,
  });
  const order = await fixtureDb.select().from(orders).get();
  const confirmation = await fixtureDb.select().from(confirmations).get();
  if (!order || !confirmation) throw new Error("注文と確認が必要です");
  const initial = JSON.stringify(await getCoreState(services, device));
  await env.TABLECAST_DB.batch(
    Array.from({ length: 100 }, (_, index) => [
      insertFixture(confirmations, { ...confirmation, id: `tablecast-bounded-snapshot-${index}` }),
      insertFixture(orders, {
        ...order,
        id: `tablecast-bounded-order-${index}`,
        snapshot_id: `tablecast-bounded-snapshot-${index}`,
        idempotency_key: `tablecast-bounded-${index}`,
      }),
      insertFixture(tableEvents, {
        store_id: device.storeId,
        table_session_id: device.tableSessionId,
        kind: "order.submitted",
        data_json: JSON.stringify({ orderId: `tablecast-bounded-order-${index}` }),
        created_at: Date.now(),
      }),
    ]).flat(),
  );
  const measured = measuredDatabase(env.TABLECAST_DB);
  const context = createExecutionContext();
  try {
    const response = await app.request(
      "/api/table/ui?view=core",
      {
        method: "PATCH",
        headers: { Cookie: `tablecast.device=${deviceToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ section: "orders" }),
      },
      { ...env, TABLECAST_DB: measured.database },
      context,
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(new TextEncoder().encode(body).byteLength).toBeLessThan(
      new TextEncoder().encode(initial).byteLength + 512,
    );
    const core = coreStateSchema.parse(JSON.parse(body));
    expect(core.orderSummary.quantity).toBe(101);
    expect(core.bill.orderedTotal).toBe(40400);
    expect(measured.stats.roundtrips).toBe(2);
    const full = await getTableState(createApiServices(env), device);
    expect(full.orders).toHaveLength(101);
    expect(full.events).toHaveLength(100);
    const page = await app.request(
      "/api/table/orders",
      { headers: { Cookie: `tablecast.device=${deviceToken}` } },
      env,
      context,
    );
    expect(orderPageSchema.parse(await page.json()).orders).toHaveLength(50);
  } finally {
    await waitOnExecutionContext(context);
  }
});
