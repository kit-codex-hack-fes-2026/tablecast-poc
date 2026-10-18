import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import app from "../src/app";
import { member, subscription } from "../src/db/auth-schema";
import { billingOutbox, voiceUsageSessions } from "../src/db/business-schema";
import { createApiServices } from "../src/platform/context";
import { setupFixture } from "./fixture";

afterEach(() => vi.restoreAllMocks());

const rates = {
  version: "tablecast-overview-v1",
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
function cycle() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15));
  if (start.getTime() > now.getTime()) start.setUTCMonth(start.getUTCMonth() - 1);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const monthStart = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1);
  const monthEnd = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1);
  return { start, end, monthStart, monthEnd, month: start.toISOString().slice(0, 7) };
}

it.each([
  { status: "active", cancelAtPeriodEnd: false },
  { status: "past_due", cancelAtPeriodEnd: false },
  { status: "active", cancelAtPeriodEnd: true },
])("$status・解約予約$cancelAtPeriodEndの当期請求を暦月集計と分離する", async (state) => {
  const { staff, cookie } = await setupFixture();
  const configuredEnv = configured();
  const services = createApiServices(configuredEnv);
  const period = cycle();
  await services.db.insert(subscription).values({
    id: "tablecast-current-cycle",
    referenceId: "tablecast-org",
    plan: rates.version,
    stripeSubscriptionId: "sub_tablecast_current",
    periodStart: period.start,
    periodEnd: period.end,
    ...state,
  });
  const events = [
    { at: period.start.getTime() - 1, seconds: 1, charge: 11, final: false },
    { at: period.start.getTime(), seconds: 2, charge: 22, final: false },
    { at: period.monthEnd - 1, seconds: 3, charge: 33 },
    { at: period.monthEnd, seconds: 4, charge: 44 },
    { at: period.end.getTime() - 1, seconds: 5, charge: 55, measurementFailed: true },
    { at: period.end.getTime(), seconds: 6, charge: 66, final: false },
    { at: period.start.getTime(), seconds: 100, charge: 999, billable: false, final: false },
    {
      at: period.start.getTime(),
      seconds: 1000,
      charge: 9999,
      organizationId: "tablecast-fixture-other-org",
    },
  ];
  const sessions = events.map((event, index) => ({
    id: `live_tablecast_cycle_${index}`,
    organizationId: event.organizationId ?? "tablecast-org",
    storeId: "tablecast-store",
    tableSessionId: "tablecast-session",
    startedAt: event.at,
    billable: event.billable ?? true,
    final: event.final ?? true,
    measurementFailed: event.measurementFailed ?? false,
    pricingVersion: "openai-2026-10-18",
    ratesJson: JSON.stringify(rates),
    updatedAt: event.at,
  }));
  await services.db.batch([
    services.db.insert(voiceUsageSessions).values(sessions.slice(0, 4)),
    services.db.insert(voiceUsageSessions).values(sessions.slice(4)),
  ]);
  await services.db.insert(billingOutbox).values([
    ...events.map((event, index) => ({
      id: `event_tablecast_cycle_${index}`,
      organizationId: event.organizationId ?? "tablecast-org",
      voiceSessionId: `live_tablecast_cycle_${index}`,
      seconds: event.seconds,
      chargeMicros: event.charge,
      createdAt: event.at,
    })),
    {
      id: "event_tablecast_cycle_repeated",
      organizationId: "tablecast-org",
      voiceSessionId: "live_tablecast_cycle_1",
      seconds: 7,
      chargeMicros: 77,
      createdAt: period.start.getTime() + 1000,
    },
  ]);
  vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    Response.json({
      id: rates.basePriceId,
      currency: "jpy",
      unit_amount: 3000,
    }),
  );
  const request = () =>
    app.fetch(
      new Request(
        `http://localhost:3000/api/admin/organizations/tablecast-org/billing?month=${period.month}`,
        { headers: { Cookie: cookie } },
      ),
      configuredEnv,
    );
  const response = await request();
  expect(response.status).toBe(200);
  const days = (period.monthEnd - period.monthStart) / 86400000;
  const dailyUsage = new Map([
    [13, { seconds: 1, chargeMicros: 11 }],
    [14, { seconds: 109, chargeMicros: 99 }],
    [days - 1, { seconds: 3, chargeMicros: 33 }],
  ]);
  const daily = Array.from({ length: days }, (_, index) => ({
    day: period.monthStart + index * 86400000,
    ...(dailyUsage.get(index) ?? { seconds: 0, chargeMicros: 0 }),
  }));
  expect(await response.json()).toMatchObject({
    month: period.month,
    period: { start: period.monthStart, end: period.monthEnd },
    usage: { seconds: 113 },
    daily,
    financial: {
      chargeMicros: 143,
      currentCycle: {
        start: period.start.getTime(),
        end: period.end.getTime(),
        chargeMicros: 231,
        unconfirmed: 2,
      },
    },
  });
  await services.db.update(member).set({ role: "member" }).where(eq(member.userId, staff.userId));
  const memberResponse = await request();
  expect(memberResponse.status).toBe(200);
  const text = await memberResponse.text();
  expect(text).not.toMatch(/chargeMicros|currentCycle|monthlyBase|stripe|markup|amountUsd/);
  expect(JSON.parse(text)).toMatchObject({
    financial: null,
    daily: daily.map(({ chargeMicros: _charge, ...day }) => day),
  });
});

it.each(["none", "canceled", "expired", "future", "missing_id", "trialing", "active_empty"])(
  "%sの契約周期と未利用状態を正しく返す",
  async (state) => {
    const { cookie } = await setupFixture();
    const configuredEnv = configured();
    const services = createApiServices(configuredEnv);
    const period = cycle();
    if (state !== "none")
      await services.db.insert(subscription).values({
        id: "tablecast-no-current-cycle",
        referenceId: "tablecast-org",
        plan: rates.version,
        status: state === "canceled" || state === "trialing" ? state : "active",
        stripeSubscriptionId: state === "missing_id" ? null : "sub_tablecast_inactive",
        periodStart: state === "future" ? period.end : period.start,
        periodEnd: state === "expired" ? new Date(Date.now() - 1) : period.end,
      });
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      Response.json({ currency: "jpy", unit_amount: 3000 }),
    );
    const response = await app.fetch(
      new Request("http://localhost:3000/api/admin/organizations/tablecast-org/billing", {
        headers: { Cookie: cookie },
      }),
      configuredEnv,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      financial: {
        currentCycle:
          state === "active_empty"
            ? {
                start: period.start.getTime(),
                end: period.end.getTime(),
                chargeMicros: 0,
                unconfirmed: 0,
              }
            : null,
      },
    });
  },
);
