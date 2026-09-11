import { env, exports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect, it } from "vitest";
import { z } from "zod";
import * as authTables from "../src/db/auth-schema";
import { createAuth } from "../src/modules/auth/service";
import { fixtureDb } from "./database-fixture";
import { setupFixture } from "./fixture";

const origin = "http://localhost:3000";
it("有効なCookieのセッションとユーザーを一度に読み、取消後は拒否する", async () => {
  // Given: 実D1に店員と有効なセッションがあり、実行SQLだけを記録する。
  const { cookie } = await setupFixture();
  const queries: string[] = [];
  const db = drizzle(env.TABLECAST_DB, {
    schema: authTables,
    logger: { logQuery: (query) => queries.push(query) },
  });
  const auth = createAuth(env, undefined, db);
  const headers = new Headers({ Cookie: cookie });

  // When: SSRと同じ公開セッションAPIで確認する。
  const response = await auth.api.getSession({ headers, asResponse: true });
  const result = z.object({ user: z.object({ id: z.string() }) }).parse(await response.json());

  // Then: userの取得はsessionとの一つのqueryに含まれ、JWT用のqueryはない。
  expect(response.status).toBe(200);
  expect(response.headers.has("set-auth-jwt")).toBe(false);
  expect(queries.filter((query) => query.includes('from "session"'))).toHaveLength(1);
  expect(queries.find((query) => query.includes('from "session"'))).toContain('from "user"');
  expect(queries.some((query) => query.includes('from "jwks"'))).toBe(false);
  await db.delete(authTables.session).where(eq(authTables.session.userId, result.user.id));
  expect(await auth.api.getSession({ headers })).toBeNull();
});

async function json(path: string, body: unknown, cookie = "") {
  return exports.default.fetch(
    new Request(origin + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin, Cookie: cookie },
      body: JSON.stringify(body),
    }),
  );
}
it("公式device承認を店舗と卓へ制限し、端末へ店員sessionを渡さない", async () => {
  const { cookie } = await setupFixture();
  const codeResponse = await json("/api/devices/request", {});
  expect(codeResponse.status).toBe(200);
  const code = z
    .object({ user_code: z.string(), device_code: z.string() })
    .parse(await codeResponse.json());
  const approve = await json(
    "/api/admin/stores/tablecast-store/devices/approve",
    { userCode: code.user_code, tableId: "tablecast-table" },
    cookie,
  );
  expect(approve.status).toBe(200);
  const poll = await json("/api/devices/poll", { device_code: code.device_code });
  expect(poll.status).toBe(200);
  const cookies = poll.headers.getSetCookie();
  expect(cookies).toHaveLength(1);
  expect(cookies[0]).toContain("tablecast.device=");
  expect(cookies[0]).toContain("HttpOnly");
  expect(cookies[0]).not.toContain("session_token");
  const deviceCookie = cookies[0]?.split(";")[0] ?? "";
  expect(
    (
      await exports.default.fetch(
        new Request(origin + "/api/table", { headers: { Cookie: deviceCookie } }),
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await exports.default.fetch(
        new Request(origin + "/api/admin/stores", { headers: { Cookie: deviceCookie } }),
      )
    ).status,
  ).toBe(401);
  expect(
    (
      await json("/api/auth/device/token", {
        client_id: "tablecast-kiosk",
        device_code: code.device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      })
    ).status,
  ).toBe(404);
});
it("店舗のmemberは担当店だけへアクセスでき、所属取消後は同じCookieでも拒否される", async () => {
  const { cookie, staff } = await setupFixture();
  await fixtureDb
    .update(authTables.member)
    .set({ role: "member" })
    .where(eq(authTables.member.userId, staff.userId));
  const read = (store: string) =>
    exports.default.fetch(
      new Request(origin + `/api/admin/stores/${store}`, { headers: { Cookie: cookie } }),
    );
  expect((await read("tablecast-store")).status).toBe(200);
  expect((await read("other-store")).status).toBe(403);
  await fixtureDb.delete(authTables.member).where(eq(authTables.member.userId, staff.userId));
  expect((await read("tablecast-store")).status).toBe(403);
});

it("cross-site変更要求を拒否する", async () => {
  const { cookie } = await setupFixture();
  const response = await exports.default.fetch(
    new Request(origin + "/api/devices/request", {
      method: "POST",
      headers: { Origin: "https://other.example", Cookie: cookie },
    }),
  );
  expect(response.status).toBe(403);
});
it("MCPはブラウザーCookieや偽Bearerを受け付けず、OAuth discoveryを返す", async () => {
  const { cookie } = await setupFixture();
  expect((await json("/mcp", { jsonrpc: "2.0", id: 1, method: "tools/list" }, cookie)).status).toBe(
    401,
  );
  const response = await exports.default.fetch(
    new Request(origin + "/mcp", {
      method: "POST",
      headers: { Authorization: "Bearer tablecast-invalid", "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
  );
  expect(response.status).toBe(401);
  expect(response.headers.get("WWW-Authenticate")).toContain("resource_metadata");
  const metadata = await exports.default.fetch(
    new Request(origin + "/.well-known/oauth-protected-resource/mcp"),
  );
  expect(metadata.status).toBe(200);
  const server = await exports.default.fetch(
    new Request(origin + "/.well-known/oauth-authorization-server/api/auth"),
  );
  expect(server.status).toBe(200);
});
it("メールログインとスタッフ表示言語を卓の言語から独立させる", async () => {
  const { cookie } = await setupFixture();
  await createAuth(env).api.updateUser({
    body: { locale: "en" },
    headers: new Headers({ Cookie: cookie }),
  });
  const staff = await exports.default.fetch(
    new Request(origin + "/api/admin/stores", { headers: { Cookie: cookie } }),
  );
  expect(z.object({ locale: z.string() }).parse(await staff.json()).locale).toBe("en");
  const table = await env.TABLECAST_DB.prepare("SELECT locale FROM table_sessions WHERE id=?")
    .bind("tablecast-session")
    .first<{ locale: string }>();
  expect(table?.locale).toBe("ja");
});
it("OAuthのPKCEと人の同意でMCPへ接続し、店舗下書きを実DBへ保存する", async () => {
  const { cookie } = await setupFixture();
  const auth = createAuth(env);
  const headers = new Headers({ Cookie: cookie, Origin: origin });
  await auth.api.setActiveOrganization({ body: { organizationId: "tablecast-org" }, headers });
  const client = await auth.api.createOAuthClient({
    body: {
      client_name: "TableCast Inspector",
      redirect_uris: ["http://127.0.0.1:6274/oauth/callback"],
      scope: "tablecast:read tablecast:write",
      token_endpoint_auth_method: "none",
      application_type: "native",
    },
    headers,
  });
  const verifier = "tablecast-proof-key-0123456789-abcdefghijklmnopqrstuvwxyz-0123456789";
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  const challenge = btoa(String.fromCharCode(...digest))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  const query = new URLSearchParams({
    client_id: client.client_id,
    response_type: "code",
    redirect_uri: "http://127.0.0.1:6274/oauth/callback",
    scope: "tablecast:read tablecast:write",
    resource: `${origin}/mcp`,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "tablecast-oauth-state",
  });
  const authorised = await exports.default.fetch(
    new Request(`${origin}/api/auth/oauth2/authorize?${query.toString()}`, {
      headers,
      redirect: "manual",
    }),
  );
  expect([200, 302, 303]).toContain(authorised.status);
  const redirect =
    authorised.headers.get("Location") ??
    z.object({ url: z.string() }).parse(await authorised.json()).url;
  const redirected = new URL(redirect, origin);
  expect(
    redirected.searchParams.get("error_description") ?? redirected.searchParams.get("error"),
  ).toBeNull();
  expect(redirected.pathname).toBe("/consent");
  const consentResponse = await json(
    "/api/auth/oauth2/consent",
    { accept: true, oauth_query: new URL(redirect, origin).search.slice(1) },
    cookie,
  );
  expect(consentResponse.status).toBe(200);
  const consent: unknown = await consentResponse.json();
  const consentUrl = z.object({ url: z.string() }).parse(consent).url;
  const code = new URL(consentUrl).searchParams.get("code");
  expect(code).toBeTruthy();
  const tokenResponse = await exports.default.fetch(
    new Request(`${origin}/api/auth/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: client.client_id,
        redirect_uri: "http://127.0.0.1:6274/oauth/callback",
        code: code ?? "",
        code_verifier: verifier,
        resource: `${origin}/mcp`,
      }),
    }),
  );
  expect(tokenResponse.status).toBe(200);
  const tokens = z.object({ access_token: z.string() }).parse(await tokenResponse.json());
  const response = await exports.default.fetch(
    new Request(`${origin}/mcp?storeId=tablecast-store`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "create_draft", arguments: {} },
      }),
    }),
  );
  expect(response.status).toBe(200);
  const body = await response.text();
  expect(body).toContain("tablecast-store");
  expect(
    (
      await env.TABLECAST_DB.prepare("SELECT COUNT(*) AS count FROM config_drafts").first<{
        count: number;
      }>()
    )?.count,
  ).toBe(1);
});

it("端末の承認待ちは正常な待機状態を返す", async () => {
  await setupFixture();
  const response = await json("/api/devices/request", {});
  const code = z.object({ device_code: z.string() }).parse(await response.json());
  const poll = await json("/api/devices/poll", { device_code: code.device_code });
  expect(poll.status).toBe(200);
  expect(await poll.json()).toEqual({ ready: false });
});

it("メール未確認のパスワード登録ではセッションを発行しない", async () => {
  const email = "tablecast-unverified@example.test";
  const password = "tablecast-verification-password";
  const signup = await json("/api/auth/sign-up/email", { email, password, name: "未確認" });
  expect(signup.status).toBe(200);
  expect(signup.headers.getSetCookie().join()).not.toContain("session_token");
  const login = await json("/api/auth/sign-in/email", { email, password });
  expect(login.status).toBe(403);
});

it("最後の組織ownerの降格を拒否し、失効したsessionを再利用できない", async () => {
  const { cookie, staff } = await setupFixture();
  const demotion = await json(
    "/api/auth/organization/update-member-role",
    { organizationId: "tablecast-org", memberId: "tablecast-member", role: "member" },
    cookie,
  );
  expect(demotion.status).toBe(400);
  const session = await env.TABLECAST_DB.prepare("SELECT token FROM session WHERE user_id=?")
    .bind(staff.userId)
    .first<{ token: string }>();
  expect(session).not.toBeNull();
  const revoke = await json("/api/auth/revoke-session", { token: session?.token }, cookie);
  expect(revoke.status).toBe(200);
  const stores = await exports.default.fetch(
    new Request(origin + "/api/admin/stores", { headers: { Cookie: cookie } }),
  );
  expect(stores.status).toBe(401);
});
