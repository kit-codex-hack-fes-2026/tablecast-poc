import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import app from "../src/app";
import { updateCart } from "../src/modules/orders/use-cases/cart";
import { prepareConfirmation } from "../src/modules/orders/use-cases/confirmation";
import { getTableState } from "../src/modules/tables/queries";
import { createApiServices } from "../src/platform/context";
import { maxCartLines, orderSchema } from "../src/schema";
import { device, deviceToken, setupFixture } from "./fixture";
import { measuredDatabase } from "./measured-database";

it.each([1, maxCartLines])(
  "%i行の実HTTP注文が金額・版・冪等性を保ち件数比例のDB往復を発生させない",
  async (count) => {
    await setupFixture();
    const services = createApiServices(env);
    for (let sample = 0; sample < 31; sample++) {
      await updateCart(services, device, {
        expectedVersion: sample * 2,
        lines: Array.from({ length: count }, (_, index) => ({
          id: `tablecast-performance-${index}`,
          productId: "tea",
          quantity: 1,
          selections: [],
        })),
      });
      const snapshot = await prepareConfirmation(services, device, {
        expectedVersion: sample * 2 + 1,
        channel: "gui",
      });
      const input = {
        snapshotId: snapshot.id,
        idempotencyKey: `tablecast-performance-order-${sample}`,
        approved: true,
      };
      const measured = measuredDatabase(env.TABLECAST_DB);
      const context = createExecutionContext();
      const started = performance.now();
      const response = await app.request(
        "/api/table/orders",
        {
          method: "POST",
          headers: {
            Cookie: `tablecast.device=${deviceToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input),
        },
        { ...env, TABLECAST_DB: measured.database },
        context,
      );
      const body = await response.text();
      const elapsedMs = performance.now() - started;
      await waitOnExecutionContext(context);
      expect(response.status).toBe(200);
      const order = orderSchema.parse(JSON.parse(body));
      expect(order.snapshot.lines).toHaveLength(count);
      expect(order.total).toBe(count * 400);
      const state = await getTableState(services, device);
      expect(state.orders).toHaveLength(sample + 1);
      expect(state.orders.some(({ id }) => id === order.id)).toBe(true);
      expect(state.cart.lines).toEqual([]);
      expect(measured.stats.roundtrips).toBeLessThanOrEqual(5);
      expect(measured.stats.statements).toBeLessThanOrEqual(12);
      console.info(
        "tablecast.order.performance",
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
  },
);
