import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import type { Actor } from "../src/modules/auth/model";
import { confirmations, orders, stores, tableSessions } from "../src/db/table-schema";
import { createDemo } from "../src/modules/demo/service";
import { updateCart } from "../src/modules/orders/use-cases/cart";
import { prepareConfirmation, submitOrder } from "../src/modules/orders/use-cases/confirmation";
import { getTableState } from "../src/modules/tables/queries";
import app from "../src/ordering-app";
import { createApiServices } from "../src/platform/context";
import {
  type CartLine,
  type CoreState,
  coreStateSchema,
  snapshotSchema,
  submittedCoreOrderSchema,
  tableStateSchema,
} from "../src/schema";
import { fixtureDb, insertFixture } from "./database-fixture";
import { configuration, device, deviceToken, setupFixture, text } from "./fixture";
import { measuredDatabase } from "./measured-database";

it.each([
  { kind: "table", count: 1, products: 8 },
  { kind: "table", count: 100, products: 120 },
  { kind: "demo", count: 1, products: 8 },
  { kind: "demo", count: 100, products: 120 },
] as const)(
  "$kindの商品$products件・カゴ履歴$count件でもHTTP操作の価格・原子性と性能予算を保つ",
  async ({ kind, count, products }) => {
    const { staff, cookie } = await setupFixture();
    const tea = configuration.products.find((product) => product.id === "tea");
    if (!tea) throw new Error("ほうじ茶の商品が必要です");
    await fixtureDb
      .update(stores)
      .set({
        config_json: JSON.stringify({
          ...configuration,
          products: Array.from({ length: products }, (_, index) => ({
            ...tea,
            id: index === 0 ? "tea" : `tablecast-performance-product-${index}`,
            text: text(`商品${index}`, `Item ${index}`),
          })),
        }),
      })
      .where(eq(stores.id, staff.storeId));
    const services = createApiServices(env);
    const demo = kind === "demo" ? await createDemo(services, staff) : undefined;
    const actor: Actor = demo ? { ...staff, tableSessionId: demo.id, demoId: demo.id } : device;
    const base = demo ? `/api/admin/stores/${staff.storeId}/demo/${demo.id}/table` : "/api/table";
    const headers = {
      Cookie: demo ? cookie : `tablecast.device=${deviceToken}`,
      "Content-Type": "application/json",
    };
    await updateCart(services, actor, {
      expectedVersion: 0,
      lines: [{ id: "tablecast-performance-seed", productId: "tea", quantity: 1, selections: [] }],
    });
    const snapshot = await prepareConfirmation(services, actor, {
      expectedVersion: 1,
      channel: "gui",
    });
    await submitOrder(services, actor, {
      snapshotId: snapshot.id,
      idempotencyKey: "tablecast-performance-seed",
      approved: true,
    });
    const row = await fixtureDb.select().from(orders).get();
    const confirmation = await fixtureDb.select().from(confirmations).get();
    if (!row || !confirmation) throw new Error("注文履歴が必要です");
    if (count > 1)
      await env.TABLECAST_DB.batch(
        Array.from({ length: count - 1 }, (_, index) => [
          insertFixture(confirmations, {
            ...confirmation,
            id: `tablecast-performance-snapshot-${index}`,
          }),
          insertFixture(orders, {
            ...row,
            id: `tablecast-performance-history-${index}`,
            snapshot_id: `tablecast-performance-snapshot-${index}`,
            idempotency_key: `tablecast-performance-history-${index}`,
          }),
        ]).flat(),
      );
    const lines: CartLine[] = Array.from({ length: count }, (_, index) => ({
      id: `tablecast-performance-line-${index}`,
      productId: "tea",
      quantity: 1,
      selections: [],
    }));
    let state: CoreState = await updateCart(services, actor, { expectedVersion: 2, lines });
    let orderedTotal = count * 400;
    const measurements: { elapsedMs: number; operation: string; sample: number }[] = [];
    async function request(
      operation: string,
      sample: number,
      path: string,
      method: string,
      input?: unknown,
    ) {
      const measured = measuredDatabase(env.TABLECAST_DB);
      const context = createExecutionContext();
      const started = performance.now();
      const response = await app.request(
        `${base}${path}?view=core`,
        { method, headers, ...(input ? { body: JSON.stringify(input) } : {}) },
        { ...env, TABLECAST_DB: measured.database },
        context,
      );
      const body = await response.text();
      const elapsedMs = performance.now() - started;
      // 後処理の完了はHTTP時間へ混ぜない。
      const responded = performance.now();
      await waitOnExecutionContext(context);
      expect(response.status).toBe(200);
      const businessBudget = operation === "order" ? 3 : 2;
      expect(measured.stats.roundtrips).toBeLessThanOrEqual(
        businessBudget + (kind === "demo" ? 1 : 0),
      );
      expect(new TextEncoder().encode(body).byteLength).toBeLessThanOrEqual(
        count === 100 ? 1024 * 1024 : 64 * 1024,
      );
      measurements.push({ operation, sample, elapsedMs });
      console.info(
        "tablecast.operation.performance",
        JSON.stringify({
          kind,
          count,
          products,
          operation,
          sample,
          elapsedMs,
          notificationDrainMs: performance.now() - responded,
          ...measured.stats,
          ...measured.timing,
          batches: measured.batches,
          bytes: new TextEncoder().encode(body).byteLength,
        }),
      );
      const parsed: unknown = JSON.parse(body);
      return parsed;
    }
    for (let sample = 0; sample < 31; sample++) {
      const quantity = (sample % 2) + 1;
      state = coreStateSchema.parse(
        await request("cart", sample, "/cart", "PUT", {
          expectedVersion: state.cart.version,
          lines: lines.map((line) => ({ ...line, quantity })),
          dismissProductId: "tea",
        }),
      );
      expect(state.cart.lines).toHaveLength(count);
      expect(state.cart.total).toBe(count * quantity * 400);
      expect(state.bill.orderedTotal).toBe(orderedTotal);
      state = coreStateSchema.parse(
        await request("ui", sample, "/ui", "PATCH", {
          section: sample % 2 ? "menu" : "cart",
          productId: null,
        }),
      );
      expect(state.uiSection).toBe(sample % 2 ? "menu" : "cart");
      state = coreStateSchema.parse(
        await request("locale", sample, "/locale", "PATCH", { locale: sample % 2 ? "ja" : "en" }),
      );
      expect(state.locale).toBe(sample % 2 ? "ja" : "en");
      state = coreStateSchema.parse(
        await request("speed", sample, "/voice/speed", "PATCH", { speed: sample % 2 ? 1 : 1.2 }),
      );
      expect(state.speechSpeed).toBe(sample % 2 ? 1 : 1.2);
      state = coreStateSchema.parse(await request("call", sample, "/call", "POST"));
      expect(state.staffCalled).toBe(true);
      state = coreStateSchema.parse(await request("bill", sample, "/bill/request", "POST"));
      expect(state.billRequested).toBe(true);
      const prepared = snapshotSchema.parse(
        await request("confirmation", sample, "/confirm", "POST", {
          expectedVersion: state.cart.version,
          channel: "gui",
        }),
      );
      expect(prepared.total).toBe(state.cart.total);
      const submitted = submittedCoreOrderSchema.parse(
        await request("order", sample, "/orders", "POST", {
          snapshotId: prepared.id,
          idempotencyKey: `tablecast-performance-${sample}`,
          approved: true,
        }),
      );
      const order = submitted.order;
      state = submitted.state;
      expect(order.total).toBe(prepared.total);
      orderedTotal += order.total;
      const latest = await getTableState(services, actor);
      expect(latest.cart.lines).toHaveLength(0);
      expect(latest.orders).toHaveLength(count + sample + 1);
      // 次標本の前提を実業務APIで復元する。
      state = await updateCart(services, actor, { expectedVersion: latest.cart.version, lines });
    }
    for (const operation of new Set(measurements.map((entry) => entry.operation))) {
      const all = measurements
        .filter((entry) => entry.operation === operation)
        .map((entry) => entry.elapsedMs)
        .toSorted((left, right) => left - right);
      expect(all).toHaveLength(31);
      expect(all[Math.ceil(all.length * 0.95) - 1]).toBeLessThan(300);
    }
  },
);

it("カゴ更新は一致する商品詳細だけを閉じ、タブ・別の商品・版検査を保つ", async () => {
  await setupFixture();
  const headers = { Cookie: `tablecast.device=${deviceToken}`, "Content-Type": "application/json" };
  const context = createExecutionContext();
  await fixtureDb
    .update(tableSessions)
    .set({ ui_section: "menu", selected_product_id: "coffee" })
    .where(eq(tableSessions.id, device.tableSessionId));
  try {
    for (const [version, dismissProductId, selected] of [
      [0, "tea", "coffee"],
      [1, "coffee", null],
    ] as const) {
      const response = await app.request(
        "/api/table/cart",
        {
          method: "PUT",
          headers,
          body: JSON.stringify({
            expectedVersion: version,
            lines: [
              { id: "tablecast-dismiss-line", productId: "tea", quantity: 1, selections: [] },
            ],
            dismissProductId,
          }),
        },
        env,
        context,
      );
      expect(response.status).toBe(200);
      const state = tableStateSchema.parse(await response.json());
      expect(state).toMatchObject({
        uiSection: "menu",
        selectedProductId: selected,
        cart: { version: version + 1, total: 400 },
      });
    }
    const rejected = await app.request(
      "/api/table/cart",
      {
        method: "PUT",
        headers,
        body: JSON.stringify({ expectedVersion: 0, lines: [], dismissProductId: "coffee" }),
      },
      env,
      context,
    );
    expect(rejected.status).toBe(409);
    expect((await getTableState(createApiServices(env), device)).cart.total).toBe(400);
  } finally {
    await waitOnExecutionContext(context);
  }
});
