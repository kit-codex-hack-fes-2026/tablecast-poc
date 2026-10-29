import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import app from "../src/app";
import { posConnections } from "../src/db/pos-schema";
import { configReleases, stores } from "../src/db/table-schema";
import { updateCart } from "../src/modules/orders/use-cases/cart";
import { prepareConfirmation, submitOrder } from "../src/modules/orders/use-cases/confirmation";
import { changeOrderStatus } from "../src/modules/orders/use-cases/status";
import { sealPosCredentials } from "../src/modules/pos/credentials";
import { getTableState } from "../src/modules/tables/queries";
import { createApiServices } from "../src/platform/context";
import { fixtureDb, insertFixture } from "./database-fixture";
import { configuration, device, setupFixture } from "./fixture";
import { catalogTax } from "./pos-square-fixture";

export const origin = "http://localhost:3000";
export const base = "/api/admin/stores/tablecast-store";
export const checkoutPath = `${base}/tables/tablecast-session/pos`;
export const deviceId = "9fa747a2-25ff-48ee-b078-04381f7c828f";
export const mappings = [{ kind: "product", localId: "tea", externalId: "square-tea" }] as const;
export const posConfiguration = {
  ...configuration,
  pos: {
    provider: "square" as const,
    connectionId: "tablecast-pos-connection",
    mappings: [...mappings],
  },
};
export const configured = () => ({
  ...env,
  TABLECAST_SQUARE_APPLICATION_ID: "sandbox-sq0idb-tablecast-test",
  TABLECAST_SQUARE_ENVIRONMENT: "sandbox" as const,
  TABLECAST_SQUARE_APPLICATION_SECRET: "sandbox-sq0csb-tablecast-test",
  TABLECAST_SQUARE_WEBHOOK_SIGNATURE_KEY: "tablecast-square-webhook-secret",
  TABLECAST_POS_ENCRYPTION_SECRET: "tablecast-pos-test-encryption-secret-at-least-32-characters",
});

export async function request(
  path: string,
  cookie: string,
  method = "GET",
  body?: unknown,
  bindings: TablecastEnv = configured(),
) {
  const options: RequestInit = { method, headers: { Cookie: cookie } };
  if (body !== undefined) {
    options.headers = { Cookie: cookie, "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const context = createExecutionContext();
  const response = await app.fetch(new Request(origin + path, options), bindings, context);
  await waitOnExecutionContext(context);
  return response;
}

export function squareHttp(hooks: { createOrder?: () => Promise<Response | void> } = {}) {
  const state = {
    amount: 400,
    catalogPrice: 400,
    completed: false,
    rejectOrder: false,
    loseOrderResponse: false,
    loseCheckoutResponse: false,
    cancelRequested: false,
    cancelled: false,
    orderCancelled: false,
    paymentOrderId: "square-order",
  };
  const requests: Request[] = [];
  const remoteOrder = () => ({
    id: "square-order",
    location_id: "square-location",
    version: 1,
    state: state.orderCancelled ? "CANCELED" : state.completed ? "COMPLETED" : "OPEN",
    total_money: { amount: state.amount, currency: "JPY" },
    tenders:
      state.completed && state.amount > 0
        ? [{ id: "square-payment", payment_id: "square-payment" }]
        : [],
  });
  const remoteCheckout = () => ({
    id: "square-checkout",
    order_id: "square-order",
    location_id: "square-location",
    amount_money: { amount: state.amount, currency: "JPY" },
    status: state.cancelled
      ? "CANCELED"
      : state.cancelRequested
        ? "CANCEL_REQUESTED"
        : state.completed
          ? "COMPLETED"
          : "PENDING",
    device_options: { device_id: deviceId },
    payment_ids: state.completed ? ["square-payment"] : [],
  });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const outbound = new Request(input, init);
    const url = new URL(outbound.url);
    if (url.origin !== "https://connect.squareupsandbox.com")
      throw new Error(`未定義の外部要求: ${outbound.url}`);
    requests.push(outbound.clone());
    if (outbound.method === "GET" && url.pathname === "/v2/locations")
      return Response.json({
        locations: [
          { id: "square-location", name: "Sandbox店舗", status: "ACTIVE", currency: "JPY" },
        ],
      });
    if (outbound.method === "GET" && url.pathname === "/v2/catalog/list")
      return Response.json({
        objects: [
          catalogTax,
          {
            type: "ITEM",
            id: "square-tea-item",
            item_data: {
              tax_ids: [catalogTax.id],
              is_taxable: true,
              name: "お茶",
              variations: [
                {
                  type: "ITEM_VARIATION",
                  id: "square-tea",
                  item_variation_data: {
                    item_id: "square-tea-item",
                    name: "通常",
                    pricing_type: "FIXED_PRICING",
                    price_money: { amount: state.catalogPrice, currency: "JPY" },
                  },
                },
              ],
            },
          },
        ],
      });
    if (outbound.method === "POST" && url.pathname === "/v2/orders/calculate")
      return Response.json({ order: remoteOrder() });
    if (outbound.method === "POST" && url.pathname === "/v2/orders") {
      const response = await hooks.createOrder?.();
      if (response) return response;
      if (state.rejectOrder)
        return Response.json(
          {
            errors: [
              {
                category: "INVALID_REQUEST_ERROR",
                code: "INVALID_VALUE",
                detail: "注文を受け付けませんでした",
              },
            ],
          },
          { status: 400 },
        );
      if (state.loseOrderResponse) {
        state.loseOrderResponse = false;
        throw new Error("Square作成後の応答喪失");
      }
      return Response.json({ order: remoteOrder() });
    }
    if (outbound.method === "GET" && url.pathname === "/v2/orders/square-order")
      return Response.json({ order: remoteOrder() });
    if (outbound.method === "POST" && url.pathname === "/v2/terminals/checkouts") {
      if (state.loseCheckoutResponse) {
        state.loseCheckoutResponse = false;
        state.completed = true;
        throw new Error("Square決済完了後の応答喪失");
      }
      return Response.json({ checkout: remoteCheckout() });
    }
    if (
      outbound.method === "POST" &&
      url.pathname === "/v2/terminals/checkouts/square-checkout/cancel"
    ) {
      state.cancelRequested = true;
      return Response.json({ checkout: remoteCheckout() });
    }
    if (outbound.method === "PUT" && url.pathname === "/v2/orders/square-order") {
      state.orderCancelled = true;
      return Response.json({ order: remoteOrder() });
    }
    if (outbound.method === "GET" && url.pathname === "/v2/terminals/checkouts/square-checkout")
      return Response.json({ checkout: remoteCheckout() });
    if (outbound.method === "GET" && url.pathname === "/v2/payments/square-payment")
      return Response.json({
        payment: {
          id: "square-payment",
          order_id: state.paymentOrderId,
          location_id: "square-location",
          terminal_checkout_id: "square-checkout",
          amount_money: { amount: state.amount, currency: "JPY" },
          status: state.completed ? "COMPLETED" : "PENDING",
        },
      });
    if (outbound.method === "POST" && url.pathname === "/v2/orders/square-order/pay") {
      state.completed = true;
      return Response.json({ order: { ...remoteOrder(), tenders: [] } });
    }
    throw new Error(`未定義のSquare要求: ${outbound.method} ${url.pathname}`);
  });
  return { state, requests };
}

export async function posConnection(userId: string) {
  const credentials = await sealPosCredentials(configured(), "tablecast-pos-connection", {
    accessToken: "tablecast-square-access-token",
    refreshToken: "tablecast-square-refresh-token",
  });
  await env.TABLECAST_DB.batch([
    insertFixture(configReleases, {
      store_id: "tablecast-store",
      version: 1,
      config_json: JSON.stringify(posConfiguration),
      published_by: userId,
      created_at: Date.now(),
    }),
    insertFixture(posConnections, {
      id: "tablecast-pos-connection",
      storeId: "tablecast-store",
      provider: "square",
      mode: "test",
      status: "connected",
      merchantId: "square-merchant",
      locationId: "square-location",
      deviceId,
      credentials,
      expiresAt: Date.now() + 30 * 86400_000,
      mappingsJson: JSON.stringify(mappings),
      revision: 1,
      updatedAt: Date.now(),
    }),
  ]);
  await fixtureDb
    .update(stores)
    .set({ config_json: JSON.stringify(posConfiguration) })
    .where(eq(stores.id, "tablecast-store"));
}

export async function servedTea(
  services: ReturnType<typeof createApiServices>,
  staff: Awaited<ReturnType<typeof setupFixture>>["staff"],
) {
  const current = await getTableState(services, device);
  const cart = await updateCart(services, device, {
    expectedVersion: current.cart.version,
    lines: [{ id: "tea-line", productId: "tea", quantity: 1, selections: [] }],
  });
  const snapshot = await prepareConfirmation(services, device, {
    expectedVersion: cart.cart.version,
    channel: "gui",
  });
  const order = await submitOrder(services, device, {
    snapshotId: snapshot.id,
    idempotencyKey: "tablecast-pos-order",
    approved: true,
  });
  await changeOrderStatus(services, staff, order.id, "accepted");
  await changeOrderStatus(services, staff, order.id, "served");
  return getTableState(services, device);
}

export async function setupPosFixture() {
  const fixture = await setupFixture();
  const services = createApiServices(configured());
  await posConnection(fixture.staff.userId);
  const table = await servedTea(services, fixture.staff);
  return { ...fixture, services, table };
}
