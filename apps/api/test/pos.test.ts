import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, assert, expect, it, vi } from "vitest";
import app from "../src/app";
import { member } from "../src/db/identity-schema";
import { posCheckouts, posConnections, posPayments, posWebhookEvents } from "../src/db/pos-schema";
import { customerCoupons, customerCouponUses } from "../src/db/rewards-schema";
import {
  payments,
  restaurantTables,
  stores,
  tableEvents,
  tableSessions,
} from "../src/db/table-schema";
import { issueCustomerCoupon } from "../src/modules/customer-coupons/use-cases/issue";
import { requestCustomerCoupon } from "../src/modules/customer-coupons/use-cases/selection";
import { recordPayment } from "../src/modules/orders/use-cases/payment";
import { readPosCredentials } from "../src/modules/pos/credentials";
import { posCheckoutViewSchema, posSettingsSchema } from "../src/modules/pos/model";
import { getTableState } from "../src/modules/tables/queries";
import { createApiServices } from "../src/platform/context";
import { setupCouponCustomer } from "./coupon-fixture";
import { fixtureDb, insertFixture } from "./database-fixture";
import { configuration, device, deviceToken, setupFixture } from "./fixture";
import {
  base,
  checkoutPath,
  configured,
  deviceId,
  mappings,
  origin,
  posConnection,
  request,
  servedTea,
  setupPosFixture,
  squareHttp,
} from "./pos-fixture";

afterEach(() => vi.restoreAllMocks());

it("Square未設定でも接続なしの設定を返し外部要求を送らない", async () => {
  const { cookie } = await setupFixture();
  const outgoing = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("外部通信は不要"));

  const response = await request(`${base}/pos`, cookie, "GET", undefined, env);

  expect(response.status).toBe(200);
  expect(posSettingsSchema.parse(await response.json())).toMatchObject({
    configured: false,
    connection: null,
    mappings: [],
  });
  expect(outgoing).not.toHaveBeenCalled();
});

it("保存tokenは接続に結び付けて暗号化し公開設定へ漏らさない", async () => {
  const { cookie } = await setupPosFixture();
  const saved = await fixtureDb.select().from(posConnections).get();
  assert(saved);
  expect(saved.credentials).not.toContain("tablecast-square-access-token");
  expect(saved.credentials).not.toContain("tablecast-square-refresh-token");
  expect(await readPosCredentials(configured(), saved.id, saved.credentials)).toEqual({
    accessToken: "tablecast-square-access-token",
    refreshToken: "tablecast-square-refresh-token",
  });
  await expect(
    readPosCredentials(configured(), "tablecast-other-connection", saved.credentials),
  ).rejects.toThrow(/decryption/i);

  const response = await request(`${base}/pos`, cookie);

  expect(response.status).toBe(200);
  const body = await response.text();
  expect(body).not.toContain(saved.credentials);
  expect(body).not.toContain("tablecast-square-access-token");
});

it.each([
  { role: "owner", expected: 200 },
  { role: "admin", expected: 200 },
  { role: "member", expected: 403 },
])("$roleの設定変更権限をHTTPで判定する", async ({ role, expected }) => {
  const { cookie, staff } = await setupPosFixture();
  squareHttp();
  await fixtureDb.update(member).set({ role }).where(eq(member.userId, staff.userId));

  const response = await request(`${base}/pos`, cookie, "PUT", {
    expectedRevision: 1,
    locationId: "square-location",
    deviceId,
  });

  expect(response.status).toBe(expected);
  expect(await response.json()).toMatchObject(
    expected === 403 ? { error: { code: "ADMIN_REQUIRED" } } : { connection: { revision: 2 } },
  );
  expect((await fixtureDb.select().from(posConnections).get())?.revision).toBe(
    expected === 200 ? 2 : 1,
  );
});

it("memberは会計を開始できても客端末と匿名は開始できない", async () => {
  const { cookie, staff, table } = await setupPosFixture();
  squareHttp();
  await fixtureDb.update(member).set({ role: "member" }).where(eq(member.userId, staff.userId));
  const body = { expectedVersion: table.cart.version, idempotencyKey: "tablecast-member-checkout" };

  const anonymous = await request(`${checkoutPath}/start`, "", "POST", body);
  const guest = await request(
    `${checkoutPath}/start`,
    `tablecast.device=${deviceToken}`,
    "POST",
    body,
  );
  const response = await request(`${checkoutPath}/start`, cookie, "POST", body);

  expect(anonymous.status).toBe(401);
  expect(guest.status).toBe(401);
  expect(response.status).toBe(200);
  expect(posCheckoutViewSchema.parse(await response.json())).toMatchObject({
    locked: true,
    checkout: { status: "pending" },
  });
  expect(await fixtureDb.select().from(posCheckouts)).toHaveLength(1);
});

it("他店舗と他来店の会計参照を拒否する", async () => {
  const { cookie } = await setupPosFixture();
  await env.TABLECAST_DB.batch([
    insertFixture(stores, {
      id: "tablecast-other-store",
      organization_id: "tablecast-fixture-other-org",
      name: "他店舗",
      config_json: JSON.stringify(configuration),
      updated_at: Date.now(),
    }),
    insertFixture(restaurantTables, {
      id: "tablecast-other-table",
      store_id: "tablecast-other-store",
      name: "他卓",
    }),
    insertFixture(tableSessions, {
      id: "tablecast-other-session",
      store_id: "tablecast-other-store",
      table_id: "tablecast-other-table",
      locale: "ja",
      guest_count: 1,
      opened_at: Date.now(),
    }),
  ]);

  const otherStore = await request("/api/admin/stores/tablecast-other-store/pos", cookie);
  const otherVisit = await request(`${base}/tables/tablecast-other-session/pos`, cookie);

  expect(otherStore.status).toBe(403);
  expect(await otherStore.json()).toMatchObject({ error: { code: "STORE_FORBIDDEN" } });
  expect(otherVisit.status).toBe(404);
  expect(await otherVisit.json()).toMatchObject({ error: { code: "TABLE_NOT_FOUND" } });
});

it("古い設定版の保存を409にし接続と対応付けを保持する", async () => {
  const { cookie } = await setupPosFixture();
  squareHttp();
  const before = await fixtureDb.select().from(posConnections).get();

  const response = await request(`${base}/pos`, cookie, "PUT", {
    expectedRevision: 0,
    locationId: "square-location",
    deviceId,
  });

  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: { code: "POS_VERSION_CONFLICT" } });
  expect(await fixtureDb.select().from(posConnections).get()).toEqual(before);
});

it.each([true, false])(
  "同じキーか異なるキーかが%jの同時開始でも会計試行は一つになる",
  async (sameKey) => {
    const { cookie, table } = await setupPosFixture();
    const provider = squareHttp();
    const start = (key: string) =>
      request(`${checkoutPath}/start`, cookie, "POST", {
        expectedVersion: table.cart.version,
        idempotencyKey: key,
      });

    const responses = await Promise.all([
      start("tablecast-start-one"),
      start(sameKey ? "tablecast-start-one" : "tablecast-start-two"),
    ]);

    expect(
      responses.map((response) => response.status).toSorted((left, right) => left - right),
    ).toEqual(sameKey ? [200, 200] : [200, 409]);
    const attempts = await fixtureDb.select().from(posCheckouts);
    expect(attempts).toHaveLength(1);
    const attempt = attempts[0];
    assert(attempt);
    expect(await fixtureDb.select().from(payments).where(eq(payments.kind, "payment"))).toEqual([]);
    const remoteKeys = await Promise.all(
      provider.requests
        .filter(
          (outbound) =>
            outbound.method === "POST" && new URL(outbound.url).pathname === "/v2/orders",
        )
        .map(async (outbound) => {
          const body: unknown = await outbound.json();
          return body;
        }),
    );
    expect(remoteKeys.length).toBeGreaterThan(0);
    for (const body of remoteKeys)
      expect(body).toMatchObject({ idempotency_key: `${attempt.id}:order` });
  },
);

it("処理中のカート・手動入金・設定変更を拒否し業務状態とイベントを維持する", async () => {
  const { cookie, table } = await setupPosFixture();
  squareHttp();
  const started = await request(`${checkoutPath}/start`, cookie, "POST", {
    expectedVersion: table.cart.version,
    idempotencyKey: "tablecast-locked-checkout",
  });
  expect(started.status).toBe(200);
  const before = await fixtureDb.select().from(tableSessions).get();
  const previousEvents = await fixtureDb.select().from(tableEvents);

  const cart = await request("/api/table/cart", `tablecast.device=${deviceToken}`, "PUT", {
    expectedVersion: table.cart.version,
    lines: [{ id: "another-tea", productId: "tea", quantity: 1, selections: [] }],
  });
  const payment = await request(`${base}/tables/tablecast-session/payments`, cookie, "POST", {
    kind: "payment",
    amount: 400,
    reason: "手動支払",
    idempotencyKey: "tablecast-manual-payment",
  });
  const settings = await request(`${base}/pos`, cookie, "PUT", {
    expectedRevision: 1,
    locationId: "square-location",
    deviceId,
  });

  expect(cart.status).toBe(409);
  expect(await cart.json()).toMatchObject({ error: { code: "POS_CHECKOUT_LOCKED" } });
  expect(payment.status).toBe(409);
  expect(await payment.json()).toMatchObject({ error: { code: "POS_CHECKOUT_LOCKED" } });
  expect(settings.status).toBe(409);
  expect(await fixtureDb.select().from(tableSessions).get()).toEqual(before);
  expect(await fixtureDb.select().from(tableEvents)).toEqual(previousEvents);
  expect(await fixtureDb.select().from(payments)).toEqual([]);
  expect((await fixtureDb.select().from(posConnections).get())?.mappingsJson).toBe(
    JSON.stringify(mappings),
  );
});

it("Square作成後の応答喪失でも同じ冪等キーで回復し再決済を作らない", async () => {
  const { cookie, table } = await setupPosFixture();
  const provider = squareHttp();
  provider.state.loseOrderResponse = true;
  const body = { expectedVersion: table.cart.version, idempotencyKey: "tablecast-response-lost" };

  const lost = await request(`${checkoutPath}/start`, cookie, "POST", body);
  expect(lost.status).toBe(200);
  expect(posCheckoutViewSchema.parse(await lost.json())).toMatchObject({
    locked: true,
    checkout: { status: "review", issue: "POS_UNKNOWN_OUTCOME" },
  });
  const recovered = await request(`${checkoutPath}/start`, cookie, "POST", body);

  expect(recovered.status).toBe(200);
  expect(posCheckoutViewSchema.parse(await recovered.json())).toMatchObject({
    locked: true,
    checkout: { status: "pending" },
  });
  expect(await fixtureDb.select().from(posCheckouts)).toHaveLength(1);
  const createRequests = provider.requests.filter(
    (outbound) => outbound.method === "POST" && new URL(outbound.url).pathname === "/v2/orders",
  );
  expect(createRequests).toHaveLength(2);
  expect(await createRequests[0]?.json()).toEqual(await createRequests[1]?.json());
});

it("登録価格が1円違えば会計試行と端末決済を作らない", async () => {
  const { cookie, table } = await setupPosFixture();
  const provider = squareHttp();
  provider.state.catalogPrice = 401;

  const response = await request(`${checkoutPath}/start`, cookie, "POST", {
    expectedVersion: table.cart.version,
    idempotencyKey: "tablecast-price-mismatch",
  });

  expect(response.status).toBe(409);
  expect(await fixtureDb.select().from(posCheckouts)).toEqual([]);
  expect(
    provider.requests.some(
      (outbound) =>
        outbound.method === "POST" && new URL(outbound.url).pathname === "/v2/terminals/checkouts",
    ),
  ).toBe(false);
});

it("同時再照会でも支払と精算イベントを一度だけ記録する", async () => {
  const { cookie, table } = await setupPosFixture();
  const provider = squareHttp();
  expect(
    (
      await request(`${checkoutPath}/start`, cookie, "POST", {
        expectedVersion: table.cart.version,
        idempotencyKey: "tablecast-reconcile",
      })
    ).status,
  ).toBe(200);
  provider.state.completed = true;

  const responses = await Promise.all([
    request(`${checkoutPath}/reconcile`, cookie, "POST"),
    request(`${checkoutPath}/reconcile`, cookie, "POST"),
  ]);

  expect(responses.map((response) => response.status)).toEqual([200, 200]);
  for (const response of responses)
    expect(posCheckoutViewSchema.parse(await response.json())).toMatchObject({
      locked: false,
      checkout: { status: "completed" },
    });
  expect(await fixtureDb.select().from(payments).where(eq(payments.kind, "payment"))).toMatchObject(
    [{ amount: 400, reason: "Square" }],
  );
  expect(await fixtureDb.select().from(posPayments)).toHaveLength(1);
  expect(
    await fixtureDb.select().from(tableEvents).where(eq(tableEvents.kind, "pos.settled")),
  ).toHaveLength(1);
  const final = await getTableState(createApiServices(configured()), device);
  expect(final.bill).toMatchObject({ due: 0, paidTotal: 400 });
  expect(final.status).toBe("open");
  expect(final.orders.map((order) => order.status)).toEqual(["served"]);
});

it("会計中のクーポン適用が途中で拒否されると券の使用状態も巻き戻る", async () => {
  const { cookie, actor, customer, ruleId, membershipId } = await setupCouponCustomer();
  const services = createApiServices(configured());
  await posConnection(actor.userId);
  await servedTea(services, actor);
  const coupon = await issueCustomerCoupon(services, actor, {
    ruleId,
    membershipId,
    idempotencyKey: crypto.randomUUID(),
  });
  await requestCustomerCoupon(services, customer, coupon.id, device.tableSessionId);
  const table = await getTableState(services, device);
  const couponBefore = await fixtureDb
    .select()
    .from(customerCoupons)
    .where(eq(customerCoupons.id, coupon.id))
    .get();
  squareHttp();
  expect(
    (
      await request(`${checkoutPath}/start`, cookie, "POST", {
        expectedVersion: table.cart.version,
        idempotencyKey: "tablecast-coupon-lock",
      })
    ).status,
  ).toBe(200);
  const previousEvents = await fixtureDb.select().from(tableEvents);

  const response = await request(`${base}/tables/tablecast-session/coupons/apply`, cookie, "POST", {
    couponId: coupon.id,
    expectedVersion: table.cart.version,
    idempotencyKey: crypto.randomUUID(),
  });

  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: { code: "POS_CHECKOUT_LOCKED" } });
  expect(
    await fixtureDb.select().from(customerCoupons).where(eq(customerCoupons.id, coupon.id)).get(),
  ).toEqual(couponBefore);
  expect(await fixtureDb.select().from(customerCouponUses)).toEqual([]);
  expect(await fixtureDb.select().from(payments)).toEqual([]);
  expect(await fixtureDb.select().from(tableEvents)).toEqual(previousEvents);
  expect((await getTableState(createApiServices(configured()), device)).cart.version).toBe(
    table.cart.version,
  );
});

it("0円会計の外部送信待ちでも閉卓をDBで拒否し精算後も開卓を保つ", async () => {
  const { cookie, staff, services } = await setupPosFixture();
  await recordPayment(services, staff, {
    kind: "adjustment",
    amount: -400,
    reason: "全額割引",
    idempotencyKey: "tablecast-free-bill",
  });
  const table = await getTableState(services, device);
  const gate = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  const provider = squareHttp({
    createOrder: async () => {
      entered.resolve();
      await gate.promise;
    },
  });
  provider.state.amount = 0;
  const starting = request(`${checkoutPath}/start`, cookie, "POST", {
    expectedVersion: table.cart.version,
    idempotencyKey: "tablecast-free-start",
  });
  try {
    await entered.promise;
    const before = await fixtureDb.select().from(tableSessions).get();
    const previousEvents = await fixtureDb.select().from(tableEvents);

    const response = await request(`${base}/tables/tablecast-session/close`, cookie, "POST");

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "POS_CHECKOUT_LOCKED" } });
    expect(await fixtureDb.select().from(tableSessions).get()).toEqual(before);
    expect(await fixtureDb.select().from(tableEvents)).toEqual(previousEvents);
  } finally {
    gate.resolve();
  }
  const result = await starting;
  expect(result.status).toBe(200);
  expect(posCheckoutViewSchema.parse(await result.json())).toMatchObject({
    locked: false,
    checkout: { status: "completed", amount: 0 },
  });
  expect(await fixtureDb.select().from(payments).where(eq(payments.kind, "payment"))).toEqual([]);
  expect((await getTableState(createApiServices(configured()), device)).status).toBe("open");
});

it("支払保存の途中失敗は精算状態とイベントも戻し再照会で一度だけ確定する", async () => {
  const { cookie, table } = await setupPosFixture();
  const provider = squareHttp();
  expect(
    (
      await request(`${checkoutPath}/start`, cookie, "POST", {
        expectedVersion: table.cart.version,
        idempotencyKey: "tablecast-atomic-settlement",
      })
    ).status,
  ).toBe(200);
  const before = await fixtureDb.select().from(tableSessions).get();
  await env.TABLECAST_DB.exec(
    "CREATE TRIGGER tablecast_fail_pos_payment BEFORE INSERT ON payments WHEN NEW.id LIKE 'pos:%' BEGIN SELECT RAISE(ABORT,'tablecast-test-pos-payment-failure'); END",
  );
  provider.state.completed = true;

  const failed = await request(`${checkoutPath}/reconcile`, cookie, "POST");

  expect(failed.status).toBe(200);
  expect(posCheckoutViewSchema.parse(await failed.json())).toMatchObject({
    locked: true,
    checkout: { status: "review" },
  });
  expect(await fixtureDb.select().from(tableSessions).get()).toEqual(before);
  expect(await fixtureDb.select().from(payments)).toEqual([]);
  expect(await fixtureDb.select().from(posPayments)).toEqual([]);
  expect(
    await fixtureDb.select().from(tableEvents).where(eq(tableEvents.kind, "pos.settled")),
  ).toEqual([]);
  await env.TABLECAST_DB.exec("DROP TRIGGER tablecast_fail_pos_payment");

  const retried = await request(`${checkoutPath}/reconcile`, cookie, "POST");

  expect(retried.status).toBe(200);
  expect(posCheckoutViewSchema.parse(await retried.json())).toMatchObject({
    locked: false,
    checkout: { status: "completed" },
  });
  expect(await fixtureDb.select().from(payments).where(eq(payments.kind, "payment"))).toHaveLength(
    1,
  );
  expect(
    await fixtureDb.select().from(tableEvents).where(eq(tableEvents.kind, "pos.settled")),
  ).toHaveLength(1);
});

it("Webhookの悪署名を拒否し実照合した通知の再送で支払を二重登録しない", async () => {
  const { cookie, table } = await setupPosFixture();
  const provider = squareHttp();
  expect(
    (
      await request(`${checkoutPath}/start`, cookie, "POST", {
        expectedVersion: table.cart.version,
        idempotencyKey: "tablecast-webhook",
      })
    ).status,
  ).toBe(200);
  provider.state.completed = true;
  provider.requests.length = 0;
  const body = JSON.stringify({
    event_id: "square-event",
    merchant_id: "square-merchant",
    type: "terminal.checkout.updated",
    data: {
      id: "square-checkout",
      object: { checkout: { id: "square-checkout", order_id: "square-order" } },
    },
  });
  const webhookUrl = origin + "/api/pos/square/webhook";
  const postWebhook = (signature: string) =>
    app.fetch(
      new Request(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-square-hmacsha256-signature": signature },
        body,
      }),
      configured(),
    );

  const invalid = await postWebhook("invalid");

  expect(invalid.status).toBe(403);
  expect(await invalid.json()).toMatchObject({ error: { code: "POS_WEBHOOK_SIGNATURE" } });
  expect(provider.requests).toHaveLength(0);
  expect(await fixtureDb.select().from(posWebhookEvents)).toEqual([]);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(configured().TABLECAST_SQUARE_WEBHOOK_SIGNATURE_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = btoa(
    String.fromCharCode(
      ...new Uint8Array(
        await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(webhookUrl + body)),
      ),
    ),
  );

  expect((await postWebhook(signature)).status).toBe(200);
  expect((await postWebhook(signature)).status).toBe(200);

  expect(await fixtureDb.select().from(posWebhookEvents)).toHaveLength(1);
  expect(await fixtureDb.select().from(payments).where(eq(payments.kind, "payment"))).toHaveLength(
    1,
  );
  expect(
    await fixtureDb.select().from(tableEvents).where(eq(tableEvents.kind, "pos.settled")),
  ).toHaveLength(1);
});
