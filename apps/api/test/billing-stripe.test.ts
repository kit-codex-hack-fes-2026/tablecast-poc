import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import app from "../src/app";
import { billingOutbox, voiceUsageSessions } from "../src/db/billing-schema";
import { member, organization, subscription } from "../src/db/identity-schema";
import { sendBillingUsage } from "../src/modules/billing/sync";
import { createApiServices } from "../src/platform/context";
import { setupFixture } from "./fixture";
const rates = {
  version: "tablecast-v1",
  markupBps: 15000,
  basePriceId: "price_tablecast_base",
  meterPriceId: "price_tablecast_usage",
  eventName: "tablecast_ai_usage",
};
const configured = () => ({
  ...env,
  TABLECAST_BILLING_ENABLED: "true",
  TABLECAST_BILLING_RATES: JSON.stringify(rates),
  TABLECAST_STRIPE_SECRET_KEY: "sk_test_tablecast",
  TABLECAST_STRIPE_WEBHOOK_SECRET: "whsec_tablecast",
});
afterEach(() => vi.restoreAllMocks());
it.each([
  { status: "active", stripeSubscriptionId: "sub_tablecast_old", expectedBase: 1000 },
  { status: "canceled", stripeSubscriptionId: "sub_tablecast_old", expectedBase: 3000 },
  { status: "incomplete", stripeSubscriptionId: null, expectedBase: 3000 },
  { status: "incomplete_expired", stripeSubscriptionId: "sub_tablecast_old", expectedBase: 3000 },
])("旧料金版の$status契約は契約状態に応じた基本料を表示する", async (state) => {
  const { cookie } = await setupFixture();
  const oldPlan = { ...rates, version: "tablecast-v0", basePriceId: "price_tablecast_old" };
  const configuredEnv = {
    ...configured(),
    TABLECAST_BILLING_RATES: JSON.stringify([rates, oldPlan]),
  };
  const services = createApiServices(configuredEnv);
  await services.db.insert(subscription).values({
    id: "tablecast-old-subscription",
    referenceId: "tablecast-org",
    plan: oldPlan.version,
    status: state.status,
    stripeSubscriptionId: state.stripeSubscriptionId,
  });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
    if (path === `/v1/prices/${rates.basePriceId}`)
      return Response.json({ id: rates.basePriceId, currency: "jpy", unit_amount: 3000 });
    if (path === `/v1/prices/${oldPlan.basePriceId}`)
      return Response.json({ id: oldPlan.basePriceId, currency: "jpy", unit_amount: 1000 });
    throw new Error(`未定義のStripe要求: ${path}`);
  });
  const response = await app.fetch(
    new Request("http://localhost:3000/api/admin/organizations/tablecast-org/billing", {
      headers: { Cookie: cookie },
    }),
    configuredEnv,
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    financial: {
      monthlyBase: state.expectedBase,
      checkoutRequired: state.status !== "active",
      checkoutPlan: rates.version,
    },
  });
});
it("署名済みWebhookを公式pluginで同期し、memberの契約操作を拒否する", async () => {
  const { staff, cookie } = await setupFixture();
  const services = createApiServices(configured());
  await services.db
    .update(organization)
    .set({ stripeCustomerId: "cus_tablecast" })
    .where(eq(organization.id, "tablecast-org"));
  const now = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    id: "evt_tablecast",
    type: "customer.subscription.created",
    data: {
      object: {
        id: "sub_tablecast",
        object: "subscription",
        customer: "cus_tablecast",
        status: "active",
        items: {
          data: [
            {
              id: "si_base",
              current_period_start: now,
              current_period_end: now + 86400,
              quantity: 1,
              price: { id: rates.basePriceId, recurring: { interval: "month" } },
            },
          ],
        },
      },
    },
  });
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("whsec_tablecast"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = Array.from(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${now}.${body}`)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  const webhook = () =>
    app.fetch(
      new Request("http://localhost:3000/api/auth/stripe/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Stripe-Signature": `t=${now},v1=${signature}`,
        },
        body,
      }),
      services.env,
    );
  expect((await webhook()).status).toBe(200);
  expect((await webhook()).status).toBe(200);
  expect(await services.db.select().from(subscription)).toHaveLength(1);
  expect(await services.db.select().from(subscription).get()).toMatchObject({
    referenceId: "tablecast-org",
    status: "active",
    plan: "tablecast-v1",
  });
  await services.db.update(member).set({ role: "member" }).where(eq(member.userId, staff.userId));
  const list = await app.fetch(
    new Request(
      "http://localhost:3000/api/auth/subscription/list?customerType=organization&referenceId=tablecast-org",
      { headers: { Cookie: cookie } },
    ),
    services.env,
  );
  expect(list.status).toBe(401);
  const invalid = await app.fetch(
    new Request("http://localhost:3000/api/auth/subscription/list?referenceId=tablecast-org", {
      headers: { Cookie: cookie },
    }),
    services.env,
  );
  expect(invalid.status).toBe(400);
});
it("送信不明イベントは同じ識別子で再送し、保持期間後は照合待ちにする", async () => {
  await setupFixture();
  const services = createApiServices(configured()),
    now = Date.now();
  await services.db.batch([
    services.db
      .update(organization)
      .set({ stripeCustomerId: "cus_tablecast" })
      .where(eq(organization.id, "tablecast-org")),
    services.db.insert(subscription).values({
      id: "tablecast-meter-sub",
      referenceId: "tablecast-org",
      plan: rates.version,
      status: "active",
      periodStart: new Date(now - 1000),
      periodEnd: new Date(now + 30 * 86400000),
    }),
    services.db.insert(voiceUsageSessions).values({
      id: "live_meter",
      organizationId: "tablecast-org",
      storeId: "tablecast-store",
      tableSessionId: "tablecast-session",
      startedAt: now,
      pricingVersion: "openai-2026-10-18",
      ratesJson: JSON.stringify(rates),
      billable: true,
      updatedAt: now,
    }),
    services.db.insert(billingOutbox).values({
      id: "voice:live_meter:90",
      organizationId: "tablecast-org",
      voiceSessionId: "live_meter",
      chargeMicros: 12000000,
      createdAt: now,
    }),
  ]);
  const bodies: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    if (typeof init?.body !== "string") throw new Error("Meter本文が必要です");
    bodies.push(init.body);
    throw new Error("connection outcome unknown");
  });
  await sendBillingUsage(services, now);
  await sendBillingUsage(services, now + 1000);
  expect(bodies).toHaveLength(2);
  expect(bodies[0]).toBe(bodies[1]);
  expect(new URLSearchParams(bodies[0]).get("payload[value]")).toBe("12000000");
  await sendBillingUsage(services, now + 23 * 3600000);
  expect(bodies).toHaveLength(2);
  expect(await services.db.select().from(billingOutbox).get()).toMatchObject({
    state: "review",
    sentAt: null,
  });
  // 契約期間をまたぐ初期料金の差額は、別期間へ自動請求しない。
  await services.db
    .update(voiceUsageSessions)
    .set({ startedAt: now - 86400000 })
    .where(eq(voiceUsageSessions.id, "live_meter"));
  await services.db.insert(billingOutbox).values({
    id: "voice:cross-period",
    voiceSessionId: "live_meter",
    organizationId: "tablecast-org",
    chargeMicros: -1000000,
    createdAt: now,
  });
  await sendBillingUsage(services, now + 1000);
  expect(bodies).toHaveLength(2);
  expect(
    await services.db
      .select()
      .from(billingOutbox)
      .where(eq(billingOutbox.id, "voice:cross-period"))
      .get(),
  ).toMatchObject({ state: "review" });
});

it("公式Checkoutへ基本料と従量Priceを同載し、Portalと20件の請求履歴を組織へ固定する", async () => {
  const { cookie } = await setupFixture();
  const services = createApiServices(configured());
  await services.db
    .update(organization)
    .set({ stripeCustomerId: "cus_tablecast" })
    .where(eq(organization.id, "tablecast-org"));
  const checkoutBodies: string[] = [];
  const requests: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    requests.push(url.href);
    if (url.pathname === "/v1/prices/price_tablecast_base")
      return Response.json({
        id: rates.basePriceId,
        currency: "jpy",
        unit_amount: 3000,
        recurring: { usage_type: "licensed", interval: "month", interval_count: 1 },
      });
    if (url.pathname === "/v1/prices/price_tablecast_usage")
      return Response.json({
        id: rates.meterPriceId,
        currency: "jpy",
        unit_amount_decimal: "0.000001",
        billing_scheme: "per_unit",
        recurring: {
          usage_type: "metered",
          interval: "month",
          interval_count: 1,
          meter: "mtr_tablecast",
        },
      });
    if (url.pathname.endsWith("/meters/mtr_tablecast"))
      return Response.json({
        id: "mtr_tablecast",
        event_name: rates.eventName,
        default_aggregation: { formula: "sum" },
        status: "active",
        customer_mapping: { type: "by_id", event_payload_key: "stripe_customer_id" },
        value_settings: { event_payload_key: "value" },
      });
    if (url.pathname === "/v1/subscriptions") return Response.json({ data: [], has_more: false });
    if (url.pathname === "/v1/checkout/sessions") {
      if (typeof init?.body !== "string") throw new Error("Checkout本文が必要です");
      checkoutBodies.push(init.body);
      return Response.json({
        id: "cs_tablecast",
        url: "https://checkout.stripe.com/c/pay/cs_tablecast",
      });
    }
    if (url.pathname === "/v1/billing_portal/sessions")
      return Response.json({
        id: "bps_tablecast",
        url: "https://billing.stripe.com/p/session/tablecast",
      });
    if (url.pathname === "/v1/invoices")
      return Response.json({
        has_more: true,
        data: Array.from({ length: 20 }, (_, index) => ({
          id: `in_tablecast_${index}`,
          number: `TABLECAST-${index}`,
          created: 1,
          status_transitions: { finalized_at: 2 },
          period_start: 1,
          period_end: 100,
          total: 3500,
          currency: "jpy",
          status: "paid",
          hosted_invoice_url: "https://invoice.stripe.com/i/tablecast",
          invoice_pdf: "https://pay.stripe.com/invoice/tablecast/pdf",
        })),
      });
    throw new Error(`未定義のStripe要求: ${url.pathname}`);
  });
  const headers = {
    Cookie: cookie,
    Origin: "http://localhost:3000",
    "Content-Type": "application/json",
  };
  const checkout = await app.fetch(
    new Request("http://localhost:3000/api/auth/subscription/upgrade", {
      method: "POST",
      headers,
      body: JSON.stringify({
        plan: rates.version,
        customerType: "organization",
        referenceId: "tablecast-org",
        successUrl: "/billing/tablecast-org",
        cancelUrl: "/billing/tablecast-org",
        disableRedirect: true,
      }),
    }),
    services.env,
  );
  expect(checkout.status).toBe(200);
  expect(await checkout.json()).toMatchObject({
    url: "https://checkout.stripe.com/c/pay/cs_tablecast",
  });
  expect(await services.db.select().from(subscription).get()).toMatchObject({
    status: "incomplete",
  });
  const params = new URLSearchParams(checkoutBodies[0]);
  expect(params.get("line_items[0][price]")).toBe(rates.basePriceId);
  expect(params.get("line_items[1][price]")).toBe(rates.meterPriceId);
  expect(params.get("line_items[1][quantity]")).toBeNull();
  const oldPlan = {
    ...rates,
    version: "tablecast-v0",
    basePriceId: "price_tablecast_old",
    meterPriceId: "price_tablecast_old_usage",
  };
  const oldCheckout = await app.fetch(
    new Request("http://localhost:3000/api/auth/subscription/upgrade", {
      method: "POST",
      headers,
      body: JSON.stringify({
        plan: oldPlan.version,
        customerType: "organization",
        referenceId: "tablecast-org",
        successUrl: "/billing/tablecast-org",
        cancelUrl: "/billing/tablecast-org",
        disableRedirect: true,
      }),
    }),
    { ...services.env, TABLECAST_BILLING_RATES: JSON.stringify([rates, oldPlan]) },
  );
  expect(oldCheckout.status).toBe(403);
  expect(checkoutBodies).toHaveLength(1);
  const portal = await app.fetch(
    new Request("http://localhost:3000/api/auth/subscription/billing-portal", {
      method: "POST",
      headers,
      body: JSON.stringify({
        customerType: "organization",
        referenceId: "tablecast-org",
        returnUrl: "/billing/tablecast-org",
        disableRedirect: true,
      }),
    }),
    services.env,
  );
  expect(portal.status).toBe(200);
  const invoices = await app.fetch(
    new Request("http://localhost:3000/api/admin/organizations/tablecast-org/billing/invoices", {
      headers,
    }),
    services.env,
  );
  expect(invoices.status).toBe(200);
  const invoiceBody: unknown = await invoices.json();
  expect(invoiceBody).toMatchObject({ next: "in_tablecast_19" });
  expect(invoiceBody).toHaveProperty("invoices.length", 20);
  expect(requests.find((url) => url.includes("/invoices?"))).toContain("customer=cus_tablecast");
  expect(requests.find((url) => url.includes("/invoices?"))).toContain("limit=20");
  const org = await app.fetch(
    new Request(
      "http://localhost:3000/api/auth/organization/get-full-organization?organizationId=tablecast-org",
      { headers },
    ),
    services.env,
  );
  expect(await org.text()).not.toContain("cus_tablecast");
});
