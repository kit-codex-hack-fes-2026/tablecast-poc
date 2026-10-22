import { makeSignature } from "better-auth/crypto";
import { env } from "cloudflare:workers";
import * as authTables from "../src/db/auth-schema";
import * as businessTables from "../src/db/business-schema";
import { type Actor } from "../src/modules/auth/model";
import { createAuth } from "../src/modules/auth/service";
import { hashDeviceToken } from "../src/modules/auth/token";
import { configuration } from "./configuration-fixture";
import { fixtureDb, insertFixture } from "./database-fixture";

export const device = {
  kind: "device",
  storeId: "tablecast-store",
  tableSessionId: "tablecast-session",
} satisfies Actor;
export const deviceToken = "tablecast-fixture-device-token";
export { configuration, text } from "./configuration-fixture";
export { resetFixtureStorage } from "./storage-fixture";

// 実認証handlerが発行したCookieを、その後のHTTP要求へ渡す。
export function responseCookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}

export async function setupFixture() {
  const auth = createAuth(env);
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser(
    { email: "tablecast-staff@example.test", name: "店員", emailVerified: true },
    { method: "admin" },
  );
  const session = await ctx.internalAdapter.createSession(user.id);
  await fixtureDb.insert(authTables.passkey).values({
    id: "tablecast-fixture-passkey",
    userId: user.id,
    credentialID: "tablecast-fixture-credential",
    publicKey: "tablecast-fixture-public-key",
    counter: 0,
    deviceType: "multiDevice",
    backedUp: true,
    createdAt: new Date(),
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
    cookie: `tablecast.session_token=${encodeURIComponent(`${session.token}.${await makeSignature(session.token, env.TABLECAST_AUTH_SECRET)}`)}`,
  };
}
