import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { assert, expect, it } from "vitest";
import { user } from "../src/db/auth-schema";
import { customerPointEntries, tableSessions } from "../src/db/business-schema";
import { createApiServices } from "../src/platform/context";
import { enrolCustomer } from "../src/modules/customers/service";
import { createCustomerVisitCode, joinCustomerVisit } from "../src/modules/customer-visits/service";
import { closeTable, openTable } from "../src/modules/tables/service";
import { recordPayment } from "../src/modules/orders/service";
import { getTableState } from "../src/modules/tables/queries";
import {
  confirmCustomerPoints,
  correctCustomerPoints,
  setPointPolicy,
} from "../src/modules/customer-points/service";
import { getCustomerPoints, getPointVisit } from "../src/modules/customer-points/queries";
import { device, setupFixture } from "./fixture";
import { fixtureDb } from "./database-fixture";
async function setup(kind: "spend" | "visit" = "spend") {
  const { staff } = await setupFixture();
  const services = createApiServices(env);
  const admin = { ...staff, tableSessionId: device.tableSessionId };
  const old = await fixtureDb
    .select()
    .from(tableSessions)
    .where(eq(tableSessions.id, device.tableSessionId))
    .get();
  assert(old?.table_id);
  await closeTable(services, admin);
  await setPointPolicy(services, admin, {
    expectedVersion: 0,
    enabled: true,
    kind,
    points: 1,
    unitYen: 100,
  });
  const session = await openTable(services, staff, {
    tableId: old.table_id,
    guestCount: 2,
    locale: "ja",
  });
  const actor = { ...admin, tableSessionId: session.id };
  const tablet = { ...device, tableSessionId: session.id, deviceId: "tablecast-device" };
  const customer = { kind: "customer", storeId: device.storeId, userId: staff.userId } as const;
  const other = { ...customer, userId: "tablecast-points-other" };
  await fixtureDb.insert(user).values({
    id: other.userId,
    name: "同行者",
    email: "points-other@example.test",
    updatedAt: new Date(),
  });
  await enrolCustomer(services, customer);
  await enrolCustomer(services, other);
  const code = await createCustomerVisitCode(services, tablet);
  await joinCustomerVisit(services, customer.userId, code.code);
  await joinCustomerVisit(services, other.userId, code.code);
  return { services, actor, customer, other, tablet };
}
it("均等配分の円端数は参加順とし、同時確認でも一度だけ付与する", async () => {
  const { services, actor, customer, other } = await setup();
  await recordPayment(services, actor, {
    amount: 401,
    kind: "adjustment",
    reason: "確定会計",
    idempotencyKey: "amount",
  });
  await recordPayment(services, actor, {
    amount: 401,
    kind: "payment",
    reason: "会計",
    idempotencyKey: "paid",
  });
  const visit = await getPointVisit(services, actor);
  const input = {
    expectedVersion: visit.expectedVersion,
    participantIds: visit.participants.map((p) => p.id),
    idempotencyKey: crypto.randomUUID(),
  };
  const results = await Promise.all([
    confirmCustomerPoints(services, actor, input),
    confirmCustomerPoints(services, actor, input),
  ]);
  expect(results[0].allocations.map((a) => a.amount)).toEqual([201, 200]);
  expect((await getCustomerPoints(services, customer, { limit: 20 })).balance).toBe(2);
  expect((await getCustomerPoints(services, other, { limit: 20 })).balance).toBe(2);
  expect(await fixtureDb.select().from(customerPointEntries)).toHaveLength(2);
});
it("設定変更は将来の来店にだけ適用し、QR参加だけでは付与しない", async () => {
  const { services, actor, customer } = await setup("visit");
  await setPointPolicy(services, actor, {
    expectedVersion: 1,
    enabled: true,
    kind: "visit",
    points: 99,
    unitYen: 100,
  });
  expect((await getPointVisit(services, actor)).rules.points).toBe(1);
  expect((await getCustomerPoints(services, customer, { limit: 20 })).balance).toBe(0);
  const visit = await getPointVisit(services, actor);
  await confirmCustomerPoints(services, actor, {
    expectedVersion: visit.expectedVersion,
    participantIds: visit.participants.map((p) => p.id),
    idempotencyKey: crypto.randomUUID(),
  });
  expect((await getCustomerPoints(services, customer, { limit: 20 })).balance).toBe(1);
});
it("会計訂正を配分とポイントへ差分反映し、不足残高を将来へ持ち越す", async () => {
  const { services, actor, customer } = await setup();
  await recordPayment(services, actor, {
    amount: 400,
    kind: "adjustment",
    reason: "会計",
    idempotencyKey: "amount",
  });
  await recordPayment(services, actor, {
    amount: 400,
    kind: "payment",
    reason: "会計",
    idempotencyKey: "paid",
  });
  const visit = await getPointVisit(services, actor);
  await confirmCustomerPoints(services, actor, {
    expectedVersion: visit.expectedVersion,
    participantIds: visit.participants.map((p) => p.id),
    idempotencyKey: crypto.randomUUID(),
  });
  const membership = visit.participants[0];
  assert(membership);
  await correctCustomerPoints(services, actor, {
    membershipId: membership.membershipId,
    delta: -3,
    reason: "誤付与の訂正",
    idempotencyKey: crypto.randomUUID(),
  });
  await recordPayment(services, actor, {
    amount: -400,
    kind: "payment",
    reason: "返金",
    idempotencyKey: "refund",
  });
  await recordPayment(services, actor, {
    amount: -300,
    kind: "adjustment",
    reason: "会計訂正",
    idempotencyKey: "correction",
  });
  expect((await getCustomerPoints(services, customer, { limit: 20 })).balance).toBe(-3);
  expect((await getPointVisit(services, actor)).allocations.map((a) => a.amount)).toEqual([50, 50]);
  expect((await getTableState(services, actor)).bill.due).toBe(100);
});
it("付与対象ゼロを明示確定でき、会員APIからスタッフ操作は実行できない", async () => {
  const { services, actor, customer } = await setup();
  const visit = await getPointVisit(services, actor);
  const result = await confirmCustomerPoints(services, actor, {
    expectedVersion: visit.expectedVersion,
    participantIds: [],
    idempotencyKey: crypto.randomUUID(),
  });
  expect(result.allocations).toEqual([]);
  expect((await getCustomerPoints(services, customer, { limit: 20 })).balance).toBe(0);
  await expect(
    setPointPolicy(
      services,
      { kind: "device", storeId: actor.storeId },
      { enabled: true, kind: "visit", points: 10, unitYen: 100, expectedVersion: 1 },
    ),
  ).rejects.toMatchObject({ code: "ADMIN_REQUIRED" });
});
