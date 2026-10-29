import { eq } from "drizzle-orm";
import { afterEach, assert, expect, it, vi } from "vitest";
import { z } from "zod";
import app from "../src/app";
import { posCheckouts, posWebhookEvents } from "../src/db/pos-schema";
import { payments, tableEvents, tableSessions } from "../src/db/table-schema";
import { posCheckoutViewSchema } from "../src/modules/pos/model";
import { fixtureDb } from "./database-fixture";
import {
  checkoutPath,
  configured,
  origin,
  request,
  setupPosFixture,
  squareHttp,
} from "./pos-fixture";

afterEach(() => vi.restoreAllMocks());

it("初回の注文作成を確定拒否されたら固定を解除して会計版を進め新しいキーで再開する", async () => {
  const { cookie, table } = await setupPosFixture();
  const provider = squareHttp();
  provider.state.rejectOrder = true;

  const rejected = await request(checkoutPath + "/start", cookie, "POST", {
    expectedVersion: table.cart.version,
    idempotencyKey: "tablecast-order-rejected",
  });
  const cancelled = posCheckoutViewSchema.parse(await rejected.json());

  expect(rejected.status).toBe(200);
  expect(cancelled).toMatchObject({
    locked: false,
    canStart: true,
    checkout: { status: "cancelled", issue: "POS_UNSUPPORTED" },
  });
  assert(cancelled.invoice);
  expect(cancelled.invoice.version).toBe(table.cart.version + 1);
  expect(await fixtureDb.select().from(payments)).toEqual([]);
  expect(
    await fixtureDb.select().from(tableEvents).where(eq(tableEvents.kind, "pos.cancelled")),
  ).toHaveLength(1);
  provider.state.rejectOrder = false;

  const restarted = await request(checkoutPath + "/start", cookie, "POST", {
    expectedVersion: cancelled.invoice.version,
    idempotencyKey: "tablecast-order-after-rejection",
  });

  expect(restarted.status).toBe(200);
  expect(posCheckoutViewSchema.parse(await restarted.json())).toMatchObject({
    locked: true,
    checkout: { status: "pending" },
  });
  const attempts = await fixtureDb.select().from(posCheckouts);
  expect(attempts).toHaveLength(2);
  expect(
    attempts.map((attempt) => attempt.status).toSorted((left, right) => left.localeCompare(right)),
  ).toEqual(["cancelled", "pending"]);
});

it("応答喪失後の注文作成拒否では固定を解放せず同じキーの照会で回復する", async () => {
  const { cookie, table } = await setupPosFixture();
  const provider = squareHttp();
  provider.state.loseOrderResponse = true;
  const input = {
    expectedVersion: table.cart.version,
    idempotencyKey: "tablecast-lost-then-rejected",
  };

  const lost = await request(checkoutPath + "/start", cookie, "POST", input);

  expect(posCheckoutViewSchema.parse(await lost.json())).toMatchObject({
    locked: true,
    checkout: { status: "review", issue: "POS_UNKNOWN_OUTCOME" },
  });
  provider.state.rejectOrder = true;

  const rejected = await request(checkoutPath + "/start", cookie, "POST", input);

  expect(posCheckoutViewSchema.parse(await rejected.json())).toMatchObject({
    locked: true,
    canStart: false,
    checkout: { status: "review", issue: "POS_UNKNOWN_OUTCOME" },
  });
  expect((await fixtureDb.select().from(tableSessions).get())?.cart_version).toBe(
    table.cart.version,
  );
  expect(
    await fixtureDb.select().from(tableEvents).where(eq(tableEvents.kind, "pos.cancelled")),
  ).toEqual([]);
  provider.state.rejectOrder = false;

  const recovered = await request(checkoutPath + "/start", cookie, "POST", input);

  expect(posCheckoutViewSchema.parse(await recovered.json())).toMatchObject({
    locked: true,
    checkout: { status: "pending" },
  });
  expect(await fixtureDb.select().from(posCheckouts)).toHaveLength(1);
  expect(await fixtureDb.select().from(payments)).toEqual([]);
});

it("同じキーの初回要求が送信中なら並行開始で注文作成を重ねない", async () => {
  const { cookie, table } = await setupPosFixture();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const provider = squareHttp({
    createOrder: async () => {
      entered.resolve();
      await release.promise;
    },
  });
  const input = {
    expectedVersion: table.cart.version,
    idempotencyKey: "tablecast-create-in-flight",
  };
  const starting = request(checkoutPath + "/start", cookie, "POST", input);
  try {
    await entered.promise;

    const concurrent = await request(checkoutPath + "/start", cookie, "POST", input);

    expect(concurrent.status).toBe(200);
    expect(posCheckoutViewSchema.parse(await concurrent.json())).toMatchObject({
      locked: true,
      checkout: { status: "preparing", issue: "POS_UNKNOWN_OUTCOME" },
    });
    expect(
      provider.requests.filter(
        (outbound) => outbound.method === "POST" && new URL(outbound.url).pathname === "/v2/orders",
      ),
    ).toHaveLength(1);
    expect(await fixtureDb.select().from(posCheckouts)).toHaveLength(1);
  } finally {
    release.resolve();
    await starting;
  }
  expect(posCheckoutViewSchema.parse(await (await starting).json())).toMatchObject({
    locked: true,
    checkout: { status: "pending" },
  });
  expect(
    provider.requests.filter(
      (outbound) => outbound.method === "POST" && new URL(outbound.url).pathname === "/v2/orders",
    ),
  ).toHaveLength(1);
});

it("期限後の新しいclaimが成功したあとに先行拒否が届いても会計を解除しない", async () => {
  const { cookie, table } = await setupPosFixture();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<Response>();
  let creates = 0;
  const provider = squareHttp({
    createOrder: async () => {
      creates++;
      if (creates === 1) {
        entered.resolve();
        return release.promise;
      }
      return undefined;
    },
  });
  const input = { expectedVersion: table.cart.version, idempotencyKey: "tablecast-claim-handover" };
  const first = request(checkoutPath + "/start", cookie, "POST", input);
  try {
    await entered.promise;
    const original = await fixtureDb.select().from(posCheckouts).get();
    assert(original?.mutationId);
    await fixtureDb
      .update(posCheckouts)
      .set({ updatedAt: Date.now() - 30_001 })
      .where(eq(posCheckouts.id, original.id));

    const successor = await request(checkoutPath + "/start", cookie, "POST", input);

    expect(successor.status).toBe(200);
    expect(posCheckoutViewSchema.parse(await successor.json())).toMatchObject({
      locked: true,
      checkout: { status: "pending" },
    });
    const beforeLateReply = await fixtureDb.select().from(posCheckouts).get();
    expect(beforeLateReply).toMatchObject({
      id: original.id,
      status: "pending",
      externalOrderId: "square-order",
    });
    release.resolve(
      Response.json(
        {
          errors: [
            {
              category: "INVALID_REQUEST_ERROR",
              code: "INVALID_VALUE",
              detail: "遅着した確定拒否",
            },
          ],
        },
        { status: 400 },
      ),
    );

    const stale = await first;

    expect(stale.status).toBe(200);
    expect(await fixtureDb.select().from(posCheckouts).get()).toEqual(beforeLateReply);
    expect(posCheckoutViewSchema.parse(await stale.json())).toMatchObject({
      locked: true,
      checkout: { status: "pending" },
    });
    expect((await fixtureDb.select().from(tableSessions).get())?.cart_version).toBe(
      table.cart.version,
    );
    expect(
      await fixtureDb.select().from(tableEvents).where(eq(tableEvents.kind, "pos.cancelled")),
    ).toEqual([]);
    expect(
      provider.requests.filter(
        (outbound) => outbound.method === "POST" && new URL(outbound.url).pathname === "/v2/orders",
      ),
    ).toHaveLength(2);
  } finally {
    release.resolve(
      Response.json(
        { errors: [{ category: "INVALID_REQUEST_ERROR", code: "INVALID_VALUE" }] },
        { status: 400 },
      ),
    );
    await first;
  }
});

it("決済要求の応答喪失後も同じキーでcheckoutを回収し一度だけ精算する", async () => {
  const { cookie, table } = await setupPosFixture();
  const provider = squareHttp();
  provider.state.loseCheckoutResponse = true;
  const input = {
    expectedVersion: table.cart.version,
    idempotencyKey: "tablecast-terminal-response-loss",
  };

  const interrupted = await request(checkoutPath + "/start", cookie, "POST", input);

  expect(posCheckoutViewSchema.parse(await interrupted.json())).toMatchObject({
    locked: true,
    checkout: { status: "review" },
  });
  expect(await fixtureDb.select().from(payments)).toEqual([]);

  const retried = await request(checkoutPath + "/start", cookie, "POST", input);

  expect(posCheckoutViewSchema.parse(await retried.json())).toMatchObject({
    locked: false,
    checkout: { status: "completed" },
  });
  const sends = provider.requests.filter(
    (outbound) =>
      outbound.method === "POST" && new URL(outbound.url).pathname === "/v2/terminals/checkouts",
  );
  const bodies = await Promise.all(
    sends.map(async (outbound) =>
      z.object({ idempotency_key: z.string() }).parse(await outbound.json()),
    ),
  );
  expect(bodies).toHaveLength(2);
  expect(bodies[0]?.idempotency_key).toBe(bodies[1]?.idempotency_key);
  expect(await fixtureDb.select().from(payments).where(eq(payments.kind, "payment"))).toHaveLength(
    1,
  );
});

it("取消要求だけでは会計を解放せず注文取消の確定で会計版を進める", async () => {
  const { cookie, table } = await setupPosFixture();
  const provider = squareHttp();
  await request(checkoutPath + "/start", cookie, "POST", {
    expectedVersion: table.cart.version,
    idempotencyKey: "tablecast-cancel-pending",
  });

  const requested = await request(checkoutPath + "/cancel", cookie, "POST");

  expect(posCheckoutViewSchema.parse(await requested.json())).toMatchObject({
    locked: true,
    canStart: false,
    checkout: { status: "pending" },
  });
  provider.state.cancelRequested = false;
  provider.state.cancelled = true;

  const reconciled = await request(checkoutPath + "/reconcile", cookie, "POST");
  const view = posCheckoutViewSchema.parse(await reconciled.json());

  expect(view).toMatchObject({ locked: false, canStart: true, checkout: { status: "cancelled" } });
  expect(view.invoice?.version).toBeGreaterThan(table.cart.version);
  expect(
    provider.requests.some(
      (outbound) =>
        outbound.method === "PUT" && new URL(outbound.url).pathname === "/v2/orders/square-order",
    ),
  ).toBe(true);
  expect(await fixtureDb.select().from(payments)).toEqual([]);
});

it("同額でも別注文の支払を取り込まず結果確認までlockを維持する", async () => {
  const { cookie, table } = await setupPosFixture();
  const provider = squareHttp();
  await request(checkoutPath + "/start", cookie, "POST", {
    expectedVersion: table.cart.version,
    idempotencyKey: "tablecast-payment-reference",
  });
  provider.state.completed = true;
  provider.state.paymentOrderId = "another-order";

  const mismatch = await request(checkoutPath + "/reconcile", cookie, "POST");

  expect(posCheckoutViewSchema.parse(await mismatch.json())).toMatchObject({
    locked: true,
    canStart: false,
    checkout: { status: "review", issue: "POS_TOTAL_MISMATCH" },
  });
  expect(await fixtureDb.select().from(payments)).toEqual([]);
  provider.state.paymentOrderId = "square-order";

  const verified = await request(checkoutPath + "/reconcile", cookie, "POST");

  expect(posCheckoutViewSchema.parse(await verified.json())).toMatchObject({
    locked: false,
    checkout: { status: "completed" },
  });
  expect(await fixtureDb.select().from(payments)).toHaveLength(1);
});

it("完了通知よりAPI反映が遅い場合は通知を消費せず同じ通知の再送で精算する", async () => {
  const { cookie, table } = await setupPosFixture();
  const provider = squareHttp();
  await request(checkoutPath + "/start", cookie, "POST", {
    expectedVersion: table.cart.version,
    idempotencyKey: "tablecast-eventual-webhook",
  });
  const body = JSON.stringify({
    event_id: "square-event-delayed-state",
    merchant_id: "square-merchant",
    type: "terminal.checkout.updated",
    data: {
      id: "square-checkout",
      object: {
        checkout: { id: "square-checkout", order_id: "square-order", status: "COMPLETED" },
      },
    },
  });
  const url = origin + "/api/pos/square/webhook";
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
        await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(url + body)),
      ),
    ),
  );
  const notify = () =>
    app.fetch(
      new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-square-hmacsha256-signature": signature },
        body,
      }),
      configured(),
    );

  const pending = await notify();

  expect(pending.status).toBe(503);
  expect(await fixtureDb.select().from(posWebhookEvents)).toEqual([]);
  expect(await fixtureDb.select().from(payments)).toEqual([]);
  provider.state.completed = true;

  expect((await notify()).status).toBe(200);
  expect((await notify()).status).toBe(200);
  expect(await fixtureDb.select().from(posWebhookEvents)).toHaveLength(1);
  expect(await fixtureDb.select().from(payments)).toHaveLength(1);
  expect((await fixtureDb.select().from(posCheckouts).get())?.status).toBe("completed");
});
