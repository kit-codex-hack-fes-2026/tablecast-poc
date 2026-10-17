import { env, exports } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { assert, expect, it } from "vitest";
import { member, organization } from "../src/db/auth-schema";
import { customerMemberships, stores } from "../src/db/business-schema";
import { createApiServices } from "../src/platform/context";
import { listCustomerMemberships, requireCustomer } from "../src/modules/customers/queries";
import { fixtureDb } from "./database-fixture";
import { setupFixture } from "./fixture";

const origin = "http://localhost:3000";
const path = "/api/customer/stores/tablecast-store";
function request(url: string, cookie?: string, body?: object, requestOrigin = origin) {
  return exports.default.fetch(
    new Request(`${origin}${url}`, {
      method: body ? "POST" : "GET",
      headers: {
        Origin: requestOrigin,
        ...(cookie ? { Cookie: cookie } : {}),
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
}

it("会員登録はログインと同意版を要求し、スタッフ所属を付与しない", async () => {
  const { cookie, staff } = await setupFixture();
  await fixtureDb.delete(member).where(eq(member.userId, staff.userId));
  expect((await request(`${path}/enrol`, undefined, { consentVersion: 1 })).status).toBe(401);
  expect((await request(`${path}/enrol`, cookie, { consentVersion: 0 })).status).toBe(422);
  expect(
    (await request(`${path}/enrol`, cookie, { consentVersion: 1 }, "https://other.example")).status,
  ).toBe(403);
  const enrolled = await request(`${path}/enrol`, cookie, { consentVersion: 1 });
  expect(enrolled.status).toBe(200);
  expect(enrolled.headers.get("Cache-Control")).toBe("private, no-store");
  expect((await request("/api/admin/stores/tablecast-store", cookie)).status).toBe(403);
  expect(await fixtureDb.select().from(member).where(eq(member.userId, staff.userId))).toHaveLength(
    0,
  );
  const membership = await requireCustomer(createApiServices(env), {
    kind: "customer",
    userId: staff.userId,
    storeId: staff.storeId,
  });
  expect(membership).toMatchObject({
    shareCompanions: true,
    useMemories: true,
    saveMemories: true,
  });
});

it("同時入会は一件となり、入会の再送で撤回した同意を復活させない", async () => {
  const { cookie, staff } = await setupFixture();
  const responses = await Promise.all([
    request(`${path}/enrol`, cookie, { consentVersion: 1 }),
    request(`${path}/enrol`, cookie, { consentVersion: 1 }),
  ]);
  expect(responses.map((response) => response.status)).toEqual([200, 200]);
  expect(await fixtureDb.select().from(customerMemberships)).toHaveLength(1);
  const preferences = {
    revision: 1,
    shareCompanions: false,
    useMemories: false,
    saveMemories: false,
  };
  expect((await request(`${path}/preferences`, cookie, preferences)).status).toBe(200);
  expect((await request(`${path}/preferences`, cookie, preferences)).status).toBe(409);
  expect((await request(`${path}/enrol`, cookie, { consentVersion: 1 })).status).toBe(200);
  const membership = await requireCustomer(createApiServices(env), {
    kind: "customer",
    userId: staff.userId,
    storeId: staff.storeId,
  });
  expect(membership).toMatchObject({
    revision: 2,
    shareCompanions: false,
    useMemories: false,
    saveMemories: false,
  });
});

it("本人と店舗の境界を保ち、退会後は会員操作を拒否する", async () => {
  const { cookie, staff } = await setupFixture();
  await request(`${path}/enrol`, cookie, { consentVersion: 1 });
  const services = createApiServices(env);
  await expect(
    requireCustomer(services, { kind: "customer", userId: "other", storeId: staff.storeId }),
  ).rejects.toMatchObject({ code: "CUSTOMER_MEMBERSHIP_REQUIRED" });
  await expect(
    requireCustomer(services, { kind: "customer", userId: staff.userId, storeId: "other" }),
  ).rejects.toMatchObject({ code: "CUSTOMER_MEMBERSHIP_REQUIRED" });
  expect((await request(`${path}/leave`, cookie, { revision: 1 })).status).toBe(200);
  await expect(
    requireCustomer(services, { kind: "customer", userId: staff.userId, storeId: staff.storeId }),
  ).rejects.toMatchObject({ code: "CUSTOMER_MEMBERSHIP_REQUIRED" });
  const [row] = await fixtureDb
    .select()
    .from(customerMemberships)
    .where(
      and(
        eq(customerMemberships.userId, staff.userId),
        eq(customerMemberships.storeId, staff.storeId),
      ),
    );
  expect(row).toMatchObject({
    active: false,
    shareCompanions: false,
    useMemories: false,
    saveMemories: false,
    revision: 2,
  });
});

it("同日時の101店舗を欠落と重複なくページ取得する", async () => {
  const { staff } = await setupFixture();
  const store = await fixtureDb.select().from(stores).where(eq(stores.id, staff.storeId)).get();
  assert(store);
  const ids = Array.from(
    { length: 101 },
    (_, index) => `tablecast-page-${String(index).padStart(3, "0")}`,
  );
  for (let offset = 0; offset < ids.length; offset += 5) {
    const group = ids.slice(offset, offset + 5);
    await fixtureDb.batch([
      fixtureDb
        .insert(organization)
        .values(group.map((id) => ({ id, slug: id, name: id, createdAt: new Date() }))),
      fixtureDb.insert(stores).values(group.map((id) => ({ ...store, id, organization_id: id }))),
      fixtureDb.insert(customerMemberships).values(
        group.map((id) => ({
          id,
          storeId: id,
          userId: staff.userId,
          active: true,
          shareCompanions: true,
          useMemories: true,
          saveMemories: true,
          consentVersion: 1,
          joinedAt: 100,
          updatedAt: 100,
        })),
      ),
    ]);
  }
  const services = createApiServices(env);
  const first = await listCustomerMemberships(services, staff.userId, { limit: 100 });
  assert(first.nextCursor);
  const next = await listCustomerMemberships(services, staff.userId, {
    limit: 100,
    beforeId: first.nextCursor.beforeId,
    beforeJoinedAt: Number(first.nextCursor.beforeJoinedAt),
  });
  expect(first.memberships).toHaveLength(100);
  expect(next.memberships).toHaveLength(1);
  expect(next.nextCursor).toBeNull();
  expect([...first.memberships, ...next.memberships].map((row) => row.id)).toEqual(
    ids.toReversed(),
  );
});
