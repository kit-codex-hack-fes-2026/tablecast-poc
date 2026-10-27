import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import app from "../src/app";
import { member } from "../src/db/identity-schema";
import { stores, tableEvents, tableSessions } from "../src/db/table-schema";
import { createDemo } from "../src/modules/demo/service";
import { createApiServices } from "../src/platform/context";
import { tableStateSchema } from "../src/schema";
import { fixtureDb } from "./database-fixture";
import { configuration, deviceToken, setupFixture } from "./fixture";

it("端末認可で取得した価格版の直後に公開が進んでも更新を拒否し、次要求で新価格を使う", async () => {
  const { staff } = await setupFixture();
  const context = createExecutionContext();
  let published = false;
  const database = new Proxy(env.TABLECAST_DB, {
    get(target, key) {
      if (key === "batch")
        return async (statements: D1PreparedStatement[]) => {
          // 価格判定後、確定batchへ入る直前に別の管理操作が公開する。
          published = true;
          await fixtureDb
            .update(stores)
            .set({
              config_version: 2,
              config_json: JSON.stringify({
                ...configuration,
                products: configuration.products.map((product) =>
                  product.id === "tea" ? { ...product, price: 700 } : product,
                ),
              }),
            })
            .where(eq(stores.id, staff.storeId));
          return target.batch(statements);
        };
      const value: unknown = Reflect.get(target, key);
      return typeof value === "function"
        ? (...args: unknown[]): unknown => Reflect.apply(value, target, args)
        : value;
    },
  });
  const input = {
    method: "PUT",
    headers: { Cookie: `tablecast.device=${deviceToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      expectedVersion: 0,
      lines: [{ id: "tablecast-price-race", productId: "tea", quantity: 1, selections: [] }],
    }),
  };
  try {
    const conflict = await app.request(
      "/api/table/cart",
      input,
      { ...env, TABLECAST_DB: database },
      context,
    );
    expect(published).toBe(true);
    expect(conflict.status).toBe(409);
    expect(await fixtureDb.select().from(tableSessions).get()).toMatchObject({
      cart_version: 0,
      cart_json: "[]",
    });
    expect(await fixtureDb.select().from(tableEvents)).toHaveLength(0);
    const retried = await app.request("/api/table/cart", input, env, context);
    expect(retried.status).toBe(200);
    expect(tableStateSchema.parse(await retried.json()).cart).toMatchObject({
      version: 1,
      total: 700,
    });
  } finally {
    await waitOnExecutionContext(context);
  }
});

it("通知を1.5秒保留してもカゴとイベントの確定後にHTTPが返り、後処理で配送する", async () => {
  await setupFixture();
  const context = createExecutionContext();
  const gate = Promise.withResolvers<void>();
  let delivered = false;
  const notification = new Proxy(env.TABLECAST_EVENTS, {
    get(target, key) {
      if (key === "get")
        return (id: DurableObjectId) =>
          new Proxy(target.get(id), {
            get(stub, method) {
              if (method === "notify")
                return async (cursor: number) => {
                  await gate.promise;
                  await stub.notify(cursor);
                  delivered = true;
                };
              const value: unknown = Reflect.get(stub, method);
              return typeof value === "function"
                ? (...args: unknown[]): unknown => Reflect.apply(value, stub, args)
                : value;
            },
          });
      const value: unknown = Reflect.get(target, key);
      return typeof value === "function"
        ? (...args: unknown[]): unknown => Reflect.apply(value, target, args)
        : value;
    },
  });
  const safety = setTimeout(() => gate.resolve(), 1500);
  try {
    const response = await app.request(
      "/api/table/cart",
      {
        method: "PUT",
        headers: { Cookie: `tablecast.device=${deviceToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: 0,
          lines: [
            { id: "tablecast-notification-line", productId: "tea", quantity: 2, selections: [] },
          ],
        }),
      },
      { ...env, TABLECAST_EVENTS: notification },
      context,
    );
    expect(response.status).toBe(200);
    expect(delivered).toBe(false);
    const state = tableStateSchema.parse(await response.json());
    expect(state.cart).toMatchObject({ version: 1, total: 800 });
    expect(state.events.some((event) => event.kind === "cart.updated")).toBe(true);
  } finally {
    clearTimeout(safety);
    gate.resolve();
    await waitOnExecutionContext(context);
  }
  expect(delivered).toBe(true);
});

it("認可の再利用は一つのHTTPだけに閉じ、別デモ・店舗と次要求での権限変更を拒否する", async () => {
  const { staff, cookie } = await setupFixture();
  const demo = await createDemo(createApiServices(env), staff);
  const context = createExecutionContext();
  const init = {
    method: "PUT",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      expectedVersion: 0,
      lines: [{ id: "tablecast-authorised-line", productId: "tea", quantity: 1, selections: [] }],
    }),
  };
  const base = `/api/admin/stores/${staff.storeId}/demo/${demo.id}/table`;
  try {
    const response = await app.request(`${base}/cart`, init, env, context);
    expect(response.status).toBe(200);
    expect(tableStateSchema.parse(await response.json()).tableName).toBe("T1");
    const wrongStore = await app.request(
      `/api/admin/stores/tablecast-other-store/demo/${demo.id}/table/cart`,
      init,
      env,
      context,
    );
    expect(wrongStore.status).toBe(403);
    const missingDemo = await app.request(
      `/api/admin/stores/${staff.storeId}/demo/tablecast-missing-demo/table/cart`,
      init,
      env,
      context,
    );
    expect(missingDemo.status).toBe(404);
    await fixtureDb.update(member).set({ role: "member" }).where(eq(member.userId, staff.userId));
    const revoked = await app.request(`${base}/cart`, init, env, context);
    expect(revoked.status).toBe(403);
  } finally {
    await waitOnExecutionContext(context);
  }
});
