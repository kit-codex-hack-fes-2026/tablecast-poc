import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import app from "../src/app";
import { member } from "../src/db/identity-schema";
import { devices, stores } from "../src/db/table-schema";
import { fixtureDb, insertFixture } from "./database-fixture";
import { configuration, setupFixture } from "./fixture";
import { measuredDatabase } from "./measured-database";

it.each([1, 100])(
  "商品・端末%i件のホーム初期表示を認可済みのfloorと存在判定で取得する",
  async (count) => {
    const { cookie, staff } = await setupFixture();
    await fixtureDb
      .update(stores)
      .set({
        config_json: JSON.stringify({
          ...configuration,
          products: Array.from({ length: count }, (_, index) => ({
            ...configuration.products[0],
            id: `tablecast-home-product-${index}`,
          })),
        }),
      })
      .where(eq(stores.id, staff.storeId));
    const device = await fixtureDb.select().from(devices).get();
    if (!device) throw new Error("端末fixtureがありません");
    if (count > 1)
      await env.TABLECAST_DB.batch(
        Array.from({ length: count - 1 }, (_, index) =>
          insertFixture(devices, {
            ...device,
            id: `tablecast-home-device-${index}`,
            token_hash: `tablecast-home-token-${index}`,
          }),
        ),
      );
    for (let sample = 0; sample < 31; sample++) {
      const measured = measuredDatabase(env.TABLECAST_DB);
      const context = createExecutionContext();
      const started = performance.now();
      let bytes = 0;
      const response = await app.request(
        `/api/admin/initial?storeId=${staff.storeId}&view=home`,
        { headers: { Cookie: cookie } },
        { ...env, TABLECAST_DB: measured.database },
        context,
      );
      const body = await response.text();
      expect(response.status).toBe(200);
      expect(JSON.parse(body)).toMatchObject({
        home: { storeId: staff.storeId, hasProducts: true, hasDevices: true },
        catalog: null,
        floor: { store: { id: staff.storeId } },
      });
      bytes += new TextEncoder().encode(body).byteLength;
      expect(measured.stats.roundtrips).toBeLessThanOrEqual(5);
      expect(bytes).toBeLessThan(8000);
      expect(measured.stats.statements).toBeLessThanOrEqual(13);
      const elapsedMs = performance.now() - started;
      await waitOnExecutionContext(context);
      console.info(
        "tablecast.home.performance",
        JSON.stringify({
          count,
          sample,
          elapsedMs,
          ...measured.stats,
          ...measured.timing,
          batches: measured.batches,
          bytes,
        }),
      );
    }
  },
);

it.each(["owner", "admin", "member"])("ホーム初期表示は%sの端末管理権限に従う", async (role) => {
  const { cookie, staff } = await setupFixture();
  await fixtureDb.update(member).set({ role }).where(eq(member.userId, staff.userId));
  const context = createExecutionContext();
  const response = await app.request(
    `/api/admin/initial?storeId=${staff.storeId}&view=home`,
    { headers: { Cookie: cookie } },
    env,
    context,
  );
  await waitOnExecutionContext(context);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    home:
      role === "member" ? null : { storeId: staff.storeId, hasProducts: true, hasDevices: true },
  });
});
