import { reset } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import * as authTables from "../src/db/auth-schema";
import * as businessTables from "../src/db/business-schema";
import { type Actor } from "../src/modules/auth/model";
import { createAuth, hashDeviceToken } from "../src/modules/auth/service";
import { ensure } from "../src/platform/errors";
import { configuration } from "./configuration-fixture";
import { fixtureDb, insertFixture } from "./database-fixture";

export const device = {
  kind: "device",
  storeId: "tablecast-store",
  tableSessionId: "tablecast-session",
} satisfies Actor;
export const deviceToken = "tablecast-fixture-device-token";
export { configuration, text } from "./configuration-fixture";
export async function resetFixtureStorage() {
  // workerd 1.20260903.1は停止中のD1をreset対象から漏らすため、直前に起動する。
  await env.TABLECAST_DB.prepare("SELECT 1").first();
  await reset();
}

export async function setupFixture() {
  const registration = await createAuth(env).api.signUpEmail({
    body: {
      email: "tablecast-staff@example.test",
      password: "tablecast-local-fixture-password",
      name: "店員",
    },
    asResponse: true,
  });
  ensure(registration.ok, "FIXTURE_AUTH_FAILED", 503);
  const user = await fixtureDb
    .select({ id: authTables.user.id })
    .from(authTables.user)
    .where(eq(authTables.user.email, "tablecast-staff@example.test"))
    .get();
  ensure(user, "FIXTURE_USER_MISSING", 503);
  await fixtureDb
    .update(authTables.user)
    .set({ emailVerified: true })
    .where(eq(authTables.user.id, user.id));
  const response = await createAuth(env).api.signInEmail({
    body: { email: "tablecast-staff@example.test", password: "tablecast-local-fixture-password" },
    asResponse: true,
  });
  const now = Date.now();
  await env.TABLECAST_DB.batch([
    insertFixture(authTables.organization, {
      id: "tablecast-fixture-other-org",
      name: "他店舗",
      slug: "tablecast-fixture-other-org",
      createdAt: new Date(now),
    }),
    insertFixture(authTables.organization, {
      id: "tablecast-org",
      name: "店舗",
      slug: "tablecast-test",
      createdAt: new Date(now),
    }),
    insertFixture(authTables.member, {
      id: "tablecast-member",
      organizationId: "tablecast-org",
      userId: user.id,
      role: "owner",
      createdAt: new Date(now),
    }),
    insertFixture(businessTables.stores, {
      id: "tablecast-store",
      organization_id: "tablecast-org",
      name: "卓上喫茶",
      config_json: JSON.stringify(configuration),
      updated_at: now,
    }),
    insertFixture(businessTables.restaurantTables, {
      id: "tablecast-table",
      store_id: "tablecast-store",
      name: "01",
    }),
    insertFixture(businessTables.tableSessions, {
      id: "tablecast-session",
      store_id: "tablecast-store",
      table_id: "tablecast-table",
      locale: "ja",
      guest_count: 2,
      opened_at: now,
    }),
    insertFixture(businessTables.devices, {
      id: "tablecast-device",
      token_hash: await hashDeviceToken(deviceToken),
      store_id: "tablecast-store",
      table_id: "tablecast-table",
      approved_by: user.id,
      created_at: now,
    }),
  ]);
  return {
    staff: {
      kind: "staff",
      storeId: "tablecast-store",
      userId: user.id,
      role: "owner",
      tableSessionId: "tablecast-session",
    } satisfies Actor,
    cookie: response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; "),
  };
}
