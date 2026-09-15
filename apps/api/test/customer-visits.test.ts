import { env, exports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { assert, expect, it } from "vitest";
import { user } from "../src/db/auth-schema";
import {
  customerVisitCodes,
  customerVisitParticipants,
  devices,
  orders,
  confirmations,
  tableSessions,
} from "../src/db/business-schema";
import { createApiServices } from "../src/platform/context";
import {
  enrolCustomer,
  leaveCustomerMembership,
  updateCustomerPreferences,
} from "../src/modules/customers/service";
import {
  createCustomerVisitCode,
  joinCustomerVisit,
  leaveCustomerVisit,
  resolveCustomerVisit,
} from "../src/modules/customer-visits/service";
import { updateCart, prepareConfirmation, submitOrder } from "../src/modules/orders/service";
import { getTableState } from "../src/modules/tables/queries";
import {
  getCustomerVisit,
  getDeviceParticipants,
  listCustomerOrders,
} from "../src/modules/customer-visits/queries";
import { fixtureDb } from "./database-fixture";
import { device, deviceToken, setupFixture } from "./fixture";

async function setupCustomers() {
  const fixture = await setupFixture();
  const services = createApiServices(env);
  const customer = {
    kind: "customer",
    storeId: device.storeId,
    userId: fixture.staff.userId,
  } as const;
  const other = { ...customer, userId: "tablecast-customer-other" };
  await fixtureDb.insert(user).values({
    id: other.userId,
    email: "tablecast-customer-other@example.test",
    name: "同行者",
    updatedAt: new Date(),
  });
  await enrolCustomer(services, customer);
  await enrolCustomer(services, other);
  const tablet = { ...device, deviceId: "tablecast-device" };
  const code = await createCustomerVisitCode(services, tablet);
  return { ...fixture, services, customer, other, tablet, code: code.code };
}

it("二人が同じQRで参加でき、再読取りと同時送信で人数が増えない", async () => {
  const { services, customer, other, tablet, code } = await setupCustomers();
  const results = await Promise.all([
    joinCustomerVisit(services, customer.userId, code),
    joinCustomerVisit(services, other.userId, code),
    joinCustomerVisit(services, customer.userId, code),
  ]);
  expect(results.every((result) => result.connected)).toBe(true);
  expect(await fixtureDb.select().from(customerVisitParticipants)).toHaveLength(2);
  expect(
    (await getDeviceParticipants(services, tablet)).participants
      .map((person) => person.name)
      .toSorted((a, b) => (a ?? "").localeCompare(b ?? "")),
  ).toEqual(["同行者", "店員"].toSorted((a, b) => (a ?? "").localeCompare(b ?? "")));
  expect((await resolveCustomerVisit(services, customer.userId, code)).membership?.active).toBe(
    true,
  );
});

it("退出後も同行履歴を残し、共有撤回を他会員の履歴へ反映する", async () => {
  const { services, customer, other, tablet, code } = await setupCustomers();
  await joinCustomerVisit(services, customer.userId, code);
  await joinCustomerVisit(services, other.userId, code);
  const result = await leaveCustomerVisit(services, other, device.tableSessionId);
  expect(result.connected).toBe(false);
  expect((await getDeviceParticipants(services, tablet)).participants).toHaveLength(1);
  await updateCustomerPreferences(services, other, {
    revision: 1,
    shareCompanions: false,
    useMemories: true,
    saveMemories: true,
  });
  const history = await getCustomerVisit(services, customer, device.tableSessionId);
  expect(history.participants).toHaveLength(2);
  expect(
    history.participants.find((person) => person.id === result.participantId)?.name,
  ).toBeNull();
  expect((await joinCustomerVisit(services, other.userId, code)).connected).toBe(true);
  expect(await fixtureDb.select().from(customerVisitParticipants)).toHaveLength(2);
});

it.each(["期限切れ", "来店終了", "端末失効"])("%sのQRでは参加を作成できない", async (condition) => {
  const { services, customer, code } = await setupCustomers();
  if (condition === "期限切れ")
    await fixtureDb
      .update(customerVisitCodes)
      .set({ expiresAt: Date.now() - 1 })
      .where(eq(customerVisitCodes.deviceId, "tablecast-device"));
  if (condition === "来店終了")
    await fixtureDb
      .update(tableSessions)
      .set({ status: "closed" })
      .where(eq(tableSessions.id, device.tableSessionId));
  if (condition === "端末失効")
    await fixtureDb
      .update(devices)
      .set({ revoked_at: Date.now() })
      .where(eq(devices.id, "tablecast-device"));
  await expect(joinCustomerVisit(services, customer.userId, code)).rejects.toMatchObject({
    code: "CUSTOMER_VISIT_CODE_EXPIRED",
  });
  expect(await fixtureDb.select().from(customerVisitParticipants)).toHaveLength(0);
});

it("会員認証と参加実績を要求し、端末Cookieを会員権限として採用しない", async () => {
  const { services, customer, other, code } = await setupCustomers();
  await joinCustomerVisit(services, customer.userId, code);
  await expect(getCustomerVisit(services, other, device.tableSessionId)).rejects.toMatchObject({
    code: "CUSTOMER_VISIT_NOT_FOUND",
  });
  const response = await exports.default.fetch(
    new Request("http://localhost:3000/api/customer/visits/join", {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
        Cookie: `tablecast.device=${deviceToken}`,
      },
      body: JSON.stringify({ code }),
    }),
  );
  expect(response.status).toBe(401);
  await expect(
    getCustomerVisit(services, { ...customer, storeId: "other" }, device.tableSessionId),
  ).rejects.toMatchObject({ code: "CUSTOMER_MEMBERSHIP_REQUIRED" });
});

it("退会で参加を終了し、再入会だけでは卓への接続を復活させない", async () => {
  const { services, customer, tablet, code } = await setupCustomers();
  await joinCustomerVisit(services, customer.userId, code);
  await leaveCustomerMembership(services, customer, 1);
  await enrolCustomer(services, customer);
  expect((await getCustomerVisit(services, customer, device.tableSessionId)).connected).toBe(false);
  expect((await getDeviceParticipants(services, tablet)).participants).toHaveLength(0);
  expect((await joinCustomerVisit(services, customer.userId, code)).connected).toBe(true);
});

it("注文IDの大小と異なる日時順でもページ境界に欠落や重複を作らない", async () => {
  const { services, customer, tablet, code } = await setupCustomers();
  await joinCustomerVisit(services, customer.userId, code);
  const state = await getTableState(services, tablet);
  const cart = await updateCart(services, tablet, {
    expectedVersion: state.cart.version,
    lines: [{ id: "page-tea", productId: "tea", quantity: 1, selections: [] }],
  });
  const snapshot = await prepareConfirmation(services, tablet, {
    expectedVersion: cart.cart.version,
    channel: "gui",
  });
  const submitted = await submitOrder(services, tablet, {
    snapshotId: snapshot.id,
    idempotencyKey: "page-order",
    approved: true,
  });
  const original = await fixtureDb.select().from(orders).where(eq(orders.id, submitted.id)).get();
  assert(original);
  const confirmation = await fixtureDb
    .select()
    .from(confirmations)
    .where(eq(confirmations.id, original.snapshot_id))
    .get();
  assert(confirmation);
  await fixtureDb.update(orders).set({ created_at: 0 }).where(eq(orders.id, original.id));
  const rows = Array.from({ length: 22 }, (_, index) => ({
    ...original,
    id: `tablecast-order-${String(22 - index).padStart(2, "0")}`,
    idempotency_key: `page-${index}`,
    created_at: 100 + Math.floor(index / 2),
  }));
  for (const row of rows)
    await fixtureDb.batch([
      fixtureDb.insert(confirmations).values({ ...confirmation, id: row.id }),
      fixtureDb.insert(orders).values({ ...row, snapshot_id: row.id }),
    ]);
  const first = await listCustomerOrders(services, customer, device.tableSessionId, { limit: 20 });
  assert(first.nextOrderCursor);
  const next = await listCustomerOrders(services, customer, device.tableSessionId, {
    limit: 20,
    beforeId: first.nextOrderCursor.beforeId,
    beforeCreatedAt: Number(first.nextOrderCursor.beforeCreatedAt),
  });
  const expected = rows
    .toSorted((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id))
    .map((r) => r.id);
  expect([...first.orders, ...next.orders].map((row) => row.id)).toEqual([
    ...expected,
    original.id,
  ]);
  expect(next.nextOrderCursor).toBeNull();
});
