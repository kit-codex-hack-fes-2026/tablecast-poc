import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { z } from "zod";
import app from "../src/app";
import { stores } from "../src/db/business-schema";
import { catalogSchema } from "../src/schema";
import { fixtureDb } from "./database-fixture";
import { configuration, setupFixture } from "./fixture";
import { measuredDatabase } from "./measured-database";

it("商品が100件でも初期取得は認可済みの全商品と価格・版を4往復以内で返す", async () => {
  const { cookie, staff } = await setupFixture();
  for (const count of [1, 100]) {
    const expanded = {
      ...configuration,
      products: Array.from({ length: count }, (_, index) => ({
        ...configuration.products[0],
        id: `tablecast-product-${index}`,
      })),
    };
    await fixtureDb
      .update(stores)
      .set({ config_json: JSON.stringify(expanded) })
      .where(eq(stores.id, staff.storeId));
    for (let sample = 0; sample < 3; sample++) {
      const measure = async (paths: string[]) => {
        const { database, stats, timing } = measuredDatabase(env.TABLECAST_DB);
        const ctx = createExecutionContext();
        const started = performance.now();
        const results: unknown[] = [];
        for (const path of paths) {
          const response = await app.request(
            path,
            { headers: { Cookie: cookie } },
            {
              ...env,
              TABLECAST_DB: database,
            },
            ctx,
          );
          expect(response.status).toBe(200);
          results.push(await response.json());
        }
        const elapsedMs = performance.now() - started;
        await waitOnExecutionContext(ctx);
        return { stats: { ...stats, ...timing }, elapsedMs, results };
      };
      const before = await measure([
        "/api/admin/initial",
        `/api/admin/stores/${staff.storeId}/catalog`,
      ]);
      const after = await measure([`/api/admin/initial?storeId=${staff.storeId}&view=catalog`]);
      expect(after.results[0]).toMatchObject({ floor: null, catalog: before.results[1] });
      const initial = z.object({ catalog: catalogSchema }).passthrough().parse(after.results[0]);
      const catalog = catalogSchema.parse(initial.catalog);
      expect(catalog).toMatchObject({
        storeId: staff.storeId,
        version: 1,
        configuration: expanded,
      });
      expect(catalog.configuration.products).toHaveLength(count);
      expect(after.stats.roundtrips).toBeLessThanOrEqual(4);
      expect(after.stats.roundtrips).toBeLessThan(before.stats.roundtrips);
      const bytes = new TextEncoder().encode(JSON.stringify(initial)).length;
      const catalogBytes = new TextEncoder().encode(JSON.stringify(catalog)).length;
      expect(bytes - catalogBytes).toBeLessThan(4000);
      console.log(
        JSON.stringify({
          count,
          sample,
          before: { ...before.stats, elapsedMs: before.elapsedMs },
          after: { ...after.stats, elapsedMs: after.elapsedMs },
          bytes,
        }),
      );
    }
  }
});
