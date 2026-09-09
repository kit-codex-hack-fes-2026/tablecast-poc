import { reset } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { createAuth, hashDeviceToken, type Actor } from "../src/auth";
import { configuration } from "./configuration-fixture";
import { ensure } from "../src/errors";

export const device: Actor = {
  kind: "device",
  storeId: "tablecast-store",
  tableSessionId: "tablecast-session",
};
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
  const user = await env.TABLECAST_DB.prepare("SELECT id FROM user WHERE email=?")
    .bind("tablecast-staff@example.test")
    .first<{ id: string }>();
  ensure(user, "FIXTURE_USER_MISSING", 503);
  await env.TABLECAST_DB.prepare("UPDATE user SET email_verified=1 WHERE id=?").bind(user.id).run();
  const response = await createAuth(env).api.signInEmail({
    body: { email: "tablecast-staff@example.test", password: "tablecast-local-fixture-password" },
    asResponse: true,
  });
  const now = Date.now();
  await env.TABLECAST_DB.batch([
    env.TABLECAST_DB.prepare(
      "INSERT INTO organization(id,name,slug,created_at) VALUES('tablecast-fixture-other-org','他店舗','tablecast-fixture-other-org',?)",
    ).bind(now),
    env.TABLECAST_DB.prepare(
      "INSERT INTO organization(id,name,slug,created_at) VALUES(?,?,?,?)",
    ).bind("tablecast-org", "店舗", "tablecast-test", now),
    env.TABLECAST_DB.prepare(
      "INSERT INTO member(id,organization_id,user_id,role,created_at) VALUES(?,?,?,?,?)",
    ).bind("tablecast-member", "tablecast-org", user.id, "owner", now),
    env.TABLECAST_DB.prepare(
      "INSERT INTO stores(id,organization_id,name,config_json,updated_at) VALUES(?,?,?,?,?)",
    ).bind("tablecast-store", "tablecast-org", "卓上喫茶", JSON.stringify(configuration), now),
    env.TABLECAST_DB.prepare("INSERT INTO restaurant_tables(id,store_id,name) VALUES(?,?,?)").bind(
      "tablecast-table",
      "tablecast-store",
      "01",
    ),
    env.TABLECAST_DB.prepare(
      "INSERT INTO table_sessions(id,store_id,table_id,locale,guest_count,opened_at) VALUES(?,?,?,?,?,?)",
    ).bind("tablecast-session", "tablecast-store", "tablecast-table", "ja", 2, now),
    env.TABLECAST_DB.prepare(
      "INSERT INTO devices(id,token_hash,store_id,table_id,approved_by,created_at) VALUES(?,?,?,?,?,?)",
    ).bind(
      "tablecast-device",
      await hashDeviceToken(deviceToken),
      "tablecast-store",
      "tablecast-table",
      user.id,
      now,
    ),
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
