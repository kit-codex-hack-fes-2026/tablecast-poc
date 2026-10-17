import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import app from "../src/app";
import * as business from "../src/db/business-schema";
import { createApiServices } from "../src/platform/context";
import { configurationSchema, tableStateSchema, type OptionCondition } from "../src/schema";
import { configuration, device, deviceToken, setupFixture, text } from "./fixture";
import { measuredDatabase } from "./measured-database";

it.each([true, false])(
  "条件充足=%sで商品上限の1024節と100行の金額・未充足・応答量を検証する",
  async (complete) => {
    await setupFixture();
    const normal = createApiServices(env);
    // 1 + 7 * 9 = 64節。16選択肢で商品全体の上限に達する。
    const expression: OptionCondition = {
      kind: "and",
      children: Array.from({ length: 7 }, () => ({
        kind: "or",
        children: Array.from({ length: 8 }, () => ({ kind: "option", optionId: "target" })),
      })),
    };
    const product = configuration.products[1];
    if (!product) throw new Error("商品fixtureがありません");
    const maximum = configurationSchema.parse({
      ...configuration,
      products: [
        {
          ...product,
          modifiers: [
            {
              id: "tablecast-condition-group",
              text: text("条件", "Conditions"),
              kind: "multiple",
              min: 0,
              max: 20,
              options: [
                ...Array.from({ length: 16 }, (_, index) => ({
                  id: `owner-${index}`,
                  text: text(`条件${index}`, `Condition ${index}`),
                  priceDelta: 0,
                  available: true,
                  conditions: { version: 2, requires: expression, excludes: null },
                })),
                { id: "target", text: text("条件対象", "Target"), priceDelta: 0, available: true },
              ],
            },
          ],
        },
      ],
    });
    await normal.db
      .update(business.stores)
      .set({ config_json: JSON.stringify(maximum) })
      .where(eq(business.stores.id, device.storeId));
    const measurements = [];
    let version = 0;
    for (const count of [1, 100]) {
      const measured = measuredDatabase(env.TABLECAST_DB);
      const context = createExecutionContext();
      const started = performance.now();
      const response = await app.request(
        "http://localhost:3000/api/table/cart",
        {
          method: "PUT",
          headers: {
            Cookie: `tablecast.device=${deviceToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            expectedVersion: version,
            lines: Array.from({ length: count }, (_, index) => ({
              id: `tablecast-condition-${index}`,
              productId: product.id,
              quantity: 1,
              selections: [
                ...Array.from({ length: 16 }, (_value, ownerIndex) => ({
                  optionId: `owner-${ownerIndex}`,
                  quantity: 1,
                })),
                ...(complete ? [{ optionId: "target", quantity: 1 }] : []),
              ],
            })),
          }),
        },
        { ...env, TABLECAST_DB: measured.database },
        context,
      );
      const body = await response.text();
      const elapsedMs = performance.now() - started;
      await waitOnExecutionContext(context);
      expect(response.status).toBe(200);
      const result = tableStateSchema.parse(JSON.parse(body));
      expect(result.cart.complete).toBe(complete);
      for (const line of result.cart.lines) {
        expect(line.conditionIssues).toEqual(
          complete
            ? undefined
            : Array.from({ length: 16 }, (_, index) => ({
                optionId: `owner-${index}`,
                relation: "requires",
              })),
        );
      }
      expect(result.cart.lines).toHaveLength(count);
      expect(result.cart.total).toBe(product.price * count);
      version = result.cart.version;
      expect(measured.stats.roundtrips).toBeLessThanOrEqual(10);
      expect(new TextEncoder().encode(body).byteLength).toBeLessThan(450000);
      expect(elapsedMs).toBeLessThan(2000);
      measurements.push({ ...measured.stats });
      console.info("条件上限の実HTTP計測", {
        complete,
        count,
        elapsedMs,
        bindingMs: measured.timing.bindingMs,
        bytes: new TextEncoder().encode(body).byteLength,
        ...measured.stats,
      });
    }
    expect(measurements[1]).toEqual(measurements[0]);
  },
);
