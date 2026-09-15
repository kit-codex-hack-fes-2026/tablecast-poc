import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import app from "../src/app";
import { member } from "../src/db/auth-schema";
import { orders } from "../src/db/business-schema";
import { statisticsQuerySchema, statisticsResultSchema } from "../src/schema";
import { getStatistics } from "../src/modules/statistics/service";
import { createApiServices } from "../src/platform/context";
import { fixtureDb } from "./database-fixture";
import { setupFixture } from "./fixture";
import { measuredDatabase } from "./measured-database";
import { addStatisticsSession, statisticsPeriod } from "./statistics-fixture";

it("閉卓期間で日跨ぎの来店を揃え、取消・返金記録・プラン・未注文の母数を分ける", async () => {
  const { staff } = await setupFixture();
  const start = Date.parse(statisticsPeriod.from),
    end = Date.parse(statisticsPeriod.to);
  await addStatisticsSession(staff, {
    id: "included",
    closedAt: start,
    orders: [
      { productId: "deleted", quantity: 2 },
      { productId: "deleted", quantity: 1, name: "新しい記録名" },
      { productId: "cancelled", quantity: 10, status: "cancelled" },
      { productId: "rejected", quantity: 20, status: "rejected" },
    ],
    payments: [
      { kind: "payment", amount: 1000 },
      { kind: "payment", amount: -100 },
      { kind: "adjustment", amount: -50 },
    ],
  });
  await addStatisticsSession(staff, {
    id: "plan",
    closedAt: end - 1,
    plan: true,
    orders: [{ productId: "deleted", quantity: 2 }],
    payments: [{ kind: "payment", amount: 2000 }],
  });
  await addStatisticsSession(staff, { id: "no-orders", closedAt: start + 1 });
  await addStatisticsSession(staff, { id: "before", closedAt: start - 1 });
  await addStatisticsSession(staff, { id: "after", closedAt: end });
  await addStatisticsSession(staff, { id: "demo", closedAt: start + 1, demo: true });
  const services = createApiServices(env);
  const result = statisticsResultSchema.parse(
    await getStatistics(
      services,
      staff,
      statisticsQuerySchema.parse({ ...statisticsPeriod, view: "products" }),
    ),
  );
  expect(result.summary).toEqual({
    sessions: 3,
    guests: 6,
    planSessions: 1,
    orders: 3,
    excludedOrders: 2,
    incompleteSnapshots: 0,
    orderedAmount: 900,
    paidAmount: 2900,
    planSessionPaidAmount: 2000,
    positivePayments: 3000,
    negativePayments: -100,
    adjustments: -50,
    staffCalls: 3,
    billCalls: 3,
  });
  expect(result.rows).toEqual([
    {
      productId: "deleted",
      optionId: null,
      name: "新しい記録名",
      quantity: 5,
      orderingSessions: 2,
      orderRate: 2 / 3,
      planCoveredQuantity: 2,
    },
  ]);
  const options = await getStatistics(
    services,
    staff,
    statisticsQuerySchema.parse({ ...statisticsPeriod, view: "modifiers", locale: "en" }),
  );
  expect(options.rows[0]).toMatchObject({
    name: "Extra",
    quantity: 10,
    orderingSessions: 2,
    planCoveredQuantity: 4,
  });
  expect(JSON.stringify(result)).not.toContain("非公開の会話本文");
  expect(JSON.stringify(result)).not.toContain(staff.userId);
});

it("実D1で商品数と来店数を増やしても1batchで集計し、継続ページが重複しない", async () => {
  const { staff, cookie } = await setupFixture();
  const closedAt = Date.parse(statisticsPeriod.from);
  await addStatisticsSession(staff, {
    id: "small",
    closedAt,
    orders: [{ productId: "商品000", quantity: 1 }],
  });
  const measured = measuredDatabase(env.TABLECAST_DB);
  const services = createApiServices({ ...env, TABLECAST_DB: measured.database });
  const input = statisticsQuerySchema.parse({ ...statisticsPeriod, view: "products" });
  const small = await getStatistics(services, staff, input);
  expect(small.rows).toHaveLength(1);
  expect(measured.stats.roundtrips).toBe(1);
  for (let i = 1; i <= 110; i++)
    await addStatisticsSession(staff, {
      id: `large-${i}`,
      closedAt,
      orders: [{ productId: `商品${String(i).padStart(3, "0")}`, quantity: 2 }],
    });
  measured.stats.roundtrips = 0;
  const first = await getStatistics(services, staff, input);
  expect(measured.stats.roundtrips).toBe(1);
  expect(first.summary.sessions).toBe(111);
  expect(first.rows).toHaveLength(30);
  expect(new TextEncoder().encode(JSON.stringify(first)).byteLength).toBeLessThan(16000);
  const second = await getStatistics(services, staff, {
    ...input,
    limit: 100,
    cursor: first.nextCursor ?? undefined,
  });
  expect(second.rows).toHaveLength(81);
  expect(second.nextCursor).toBeNull();
  expect(new Set([...first.rows, ...second.rows].map((row) => row.productId)).size).toBe(111);
  expect(second.asOf).toBe(first.asOf);
  await expect(
    getStatistics(services, staff, {
      ...input,
      locale: "en",
      cursor: first.nextCursor ?? undefined,
    }),
  ).rejects.toMatchObject({ code: "STATISTICS_CURSOR_INVALID" });
  const context = createExecutionContext();
  const http = await app.request(
    `/api/admin/stores/${staff.storeId}/statistics?${new URLSearchParams(statisticsPeriod).toString()}`,
    { headers: { Cookie: cookie } },
    env,
    context,
  );
  expect(http.status).toBe(200);
  expect(statisticsResultSchema.parse(await http.json()).summary).toEqual(first.summary);
  await waitOnExecutionContext(context);
});

it("0件と取得不能を区別し、不正期間・timezone・cursorを拒否する", async () => {
  const { staff } = await setupFixture();
  const services = createApiServices(env);
  const input = statisticsQuerySchema.parse(statisticsPeriod);
  const empty = await getStatistics(services, staff, input);
  expect(empty.summary.sessions).toBe(0);
  expect(empty.summary.paidAmount).toBe(0);
  expect(empty.rows).toEqual([]);
  expect(empty.nextCursor).toBeNull();
  for (const extra of [
    { to: statisticsPeriod.from },
    { timeZone: "invalid" },
    { from: "2026-09-01" },
    { limit: 101 },
  ])
    expect(statisticsQuerySchema.safeParse({ ...statisticsPeriod, ...extra }).success).toBe(false);
  await expect(
    getStatistics(services, staff, { ...input, cursor: "invalid" }),
  ).rejects.toMatchObject({ code: "STATISTICS_CURSOR_INVALID" });
  await addStatisticsSession(staff, {
    id: "missing",
    closedAt: Date.parse(statisticsPeriod.from),
    orders: [{ productId: "missing", quantity: 1 }],
  });
  await fixtureDb
    .update(orders)
    .set({ snapshot_json: "{}" })
    .where(eq(orders.id, "missing-order-0"));
  const incomplete = await getStatistics(services, staff, { ...input, view: "products" });
  expect(incomplete.summary).toMatchObject({ sessions: 1, orders: 1, incompleteSnapshots: 1 });
  expect(incomplete.rows).toEqual([]);
});

it("ownerとadminだけがHTTPと業務境界で統計を読み、他店舗・未ログインを拒否する", async () => {
  const { staff, cookie } = await setupFixture();
  const path = `/api/admin/stores/${staff.storeId}/statistics?${new URLSearchParams(statisticsPeriod).toString()}`;
  expect((await app.request(path, {}, env)).status).toBe(401);
  expect(
    (await app.request(path.replace(staff.storeId, "other"), { headers: { Cookie: cookie } }, env))
      .status,
  ).toBe(403);
  const services = createApiServices(env);
  const input = statisticsQuerySchema.parse(statisticsPeriod);
  expect(
    (await getStatistics(services, { ...staff, kind: "mcp", canWrite: false }, input)).summary
      .sessions,
  ).toBe(0);
  for (const kind of ["device", "voice"] as const)
    await expect(getStatistics(services, { ...staff, kind }, input)).rejects.toMatchObject({
      code: "ADMIN_REQUIRED",
    });
  await fixtureDb.update(member).set({ role: "member" }).where(eq(member.id, "tablecast-member"));
  expect((await app.request(path, { headers: { Cookie: cookie } }, env)).status).toBe(403);
  await fixtureDb.update(member).set({ role: "admin" }).where(eq(member.id, "tablecast-member"));
  expect((await app.request(path, { headers: { Cookie: cookie } }, env)).status).toBe(200);
});
