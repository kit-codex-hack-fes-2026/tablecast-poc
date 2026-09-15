import { env, exports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { user } from "../src/db/auth-schema";
import {
  customerVisitCodes,
  customerVisitParticipants,
  devices,
  tableSessions,
} from "../src/db/business-schema";
import { createApiServices } from "../src/platform/context";
import { enrolCustomer, updateCustomerPreferences } from "../src/modules/customers/service";
import {
  createCustomerVisitCode,
  joinCustomerVisit,
  leaveCustomerVisit,
  resolveCustomerVisit,
} from "../src/modules/customer-visits/service";
import { getCustomerVisit, getDeviceParticipants } from "../src/modules/customer-visits/queries";
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
