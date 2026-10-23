import type { Billing } from "./billing-query";
const dailySeconds = [
  60, 120, 90, 150, 180, 240, 300, 180, 360, 120, 300, 420, 240, 480, 600, 420, 360, 780,
];
export const billingFixture = {
  organization: { id: "tablecast-billing-org", name: "卓上喫茶" },
  storeId: "tablecast-billing-store",
  canManage: true,
  month: "2026-10",
  period: { start: Date.UTC(2026, 9, 1), end: Date.UTC(2026, 10, 1) },
  daily: Array.from({ length: 31 }, (_, index) => ({
    day: Date.UTC(2026, 9, index + 1),
    seconds: dailySeconds[index] ?? 0,
    chargeMicros: index < 17 ? (dailySeconds[index] ?? 0) * 230000 : index === 17 ? 187900000 : 0,
  })),
  usage: {
    seconds: 5400,
    responses: 120,
    inputTokens: 80000,
    cachedTokens: 20000,
    outputTokens: 6000,
    unconfirmed: 1,
    aiState: "ready",
  },
  visits: [
    {
      id: "live_tablecast",
      sessionId: "tablecast-visit-01",
      storeId: "tablecast-billing-store",
      tableName: "T01",
      startedAt: Date.UTC(2026, 9, 18, 3),
      demo: false,
      seconds: 90,
      chargeMicros: 12073600,
      responses: 1,
      inputTokens: 1000,
      outputTokens: 100,
      final: true,
    },
  ],
  next: null,
  updatedAt: Date.UTC(2026, 9, 18, 3, 5),
  financial: {
    chargeMicros: 1250500000,
    monthlyBase: 3000,
    configured: true,
    priceUnavailable: false,
    checkoutRequired: false,
    checkoutPlan: "tablecast-standard-v1",
    currentCycle: {
      start: Date.UTC(2026, 9, 15),
      end: Date.UTC(2026, 10, 15),
      chargeMicros: 420250000,
      unconfirmed: 1,
    },
    subscription: {
      plan: "tablecast-standard-v1",
      status: "active",
      periodStart: Date.UTC(2026, 9, 15),
      periodEnd: Date.UTC(2026, 10, 15),
      cancelAtPeriodEnd: false,
    },
  },
} satisfies Billing;
