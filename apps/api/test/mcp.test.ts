import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { env, exports } from "cloudflare:workers";
import { afterEach, expect, it, onTestFinished, vi } from "vitest";
import { z } from "zod";
import app from "../src/app";
import * as authTables from "../src/db/auth-schema";
import * as businessTables from "../src/db/business-schema";
import { createAuth } from "../src/modules/auth/service";
import { catalogSchema, configDraftSchema, voicePageSchema } from "../src/schema";
import { insertFixture } from "./database-fixture";
import { configuration as fixtureConfiguration, setupFixture } from "./fixture";

afterEach(() => vi.restoreAllMocks());

const origin = "http://localhost:3000";

async function post(path: string, body: unknown, headers: HeadersInit = {}) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Content-Type", "application/json");
  requestHeaders.set("Origin", origin);
  return exports.default.fetch(
    new Request(origin + path, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(body),
    }),
  );
}

// 認証を迂回せず、公式の認可コード・PKCE・同意でこの試験だけのtokenを発行する。
async function authorise(cookie: string, scope = "tablecast:read tablecast:write") {
  const auth = createAuth(env);
  const headers = new Headers({ Cookie: cookie, Origin: origin });
  await auth.api.setActiveOrganization({ body: { organizationId: "tablecast-org" }, headers });
  const registered = await auth.api.createOAuthClient({
    body: {
      client_name: "TableCast MCP統合試験",
      redirect_uris: ["http://127.0.0.1:6274/oauth/callback"],
      scope,
      token_endpoint_auth_method: "none",
      application_type: "native",
    },
    headers,
  });
  const verifier = "tablecast-mcp-proof-key-0123456789-abcdefghijklmnopqrstuvwxyz-0123456789";
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  const query = new URLSearchParams({
    client_id: registered.client_id,
    response_type: "code",
    redirect_uri: "http://127.0.0.1:6274/oauth/callback",
    scope,
    resource: `${origin}/mcp`,
    code_challenge: btoa(String.fromCharCode(...digest))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", ""),
    code_challenge_method: "S256",
    state: "tablecast-mcp-state",
  });
  const response = await exports.default.fetch(
    new Request(`${origin}/api/auth/oauth2/authorize?${query.toString()}`, {
      headers,
      redirect: "manual",
    }),
  );
  expect([200, 302, 303]).toContain(response.status);
  const redirect =
    response.headers.get("Location") ??
    z.object({ url: z.string() }).parse(await response.json()).url;
  expect(new URL(redirect, origin).pathname).toBe("/consent");
  const consent = await post(
    "/api/auth/oauth2/consent",
    { accept: true, oauth_query: new URL(redirect, origin).search.slice(1) },
    headers,
  );
  expect(consent.status).toBe(200);
  const callback = new URL(z.object({ url: z.string() }).parse(await consent.json()).url);
  const code = callback.searchParams.get("code");
  if (!code) throw new Error("MCP試験の認可コードがありません");
  const tokenResponse = await exports.default.fetch(
    new Request(`${origin}/api/auth/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: registered.client_id,
        redirect_uri: "http://127.0.0.1:6274/oauth/callback",
        code,
        code_verifier: verifier,
        resource: `${origin}/mcp`,
      }),
    }),
  );
  expect(tokenResponse.status).toBe(200);
  return {
    token: z.object({ access_token: z.string() }).parse(await tokenResponse.json()).access_token,
    clientId: registered.client_id,
  };
}

async function connect(token: string, storeId = "tablecast-store", configured?: TablecastEnv) {
  const client = new Client({ name: "tablecast-integration", version: "1.0.0" });
  onTestFinished(() => client.close());
  await client.connect(
    new StreamableHTTPClientTransport(
      new URL(`${origin}/mcp?storeId=${encodeURIComponent(storeId)}`),
      {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
        fetch: async (url, init) =>
          await (configured
            ? app.fetch(new Request(url, init), configured)
            : exports.default.fetch(new Request(url, init))),
      },
    ),
  );
  return client;
}

function toolData<T>(value: unknown, schema: z.ZodType<T>): T {
  const result = CallToolResultSchema.parse(value);
  expect(result.isError).not.toBe(true);
  const content = result.content[0];
  if (content?.type !== "text") throw new Error("MCP設定応答がJSON textではありません");
  return schema.parse(JSON.parse(content.text));
}

function toolError(value: unknown, code: string) {
  const result = CallToolResultSchema.parse(value);
  expect(result.isError).toBe(true);
  const content = result.content[0];
  if (content?.type !== "text") throw new Error("MCPエラー応答がtextではありません");
  expect(content.text).toContain(code);
}

it("読み取りだけのOAuth委譲では、管理者でもMCPの書き込みを拒否する", async () => {
  const { cookie } = await setupFixture();
  const { token } = await authorise(cookie, "tablecast:read");
  const client = await connect(token);
  expect(client.getInstructions()).toContain(`${env.TABLECAST_PUBLIC_ORIGIN}/llms.txt`);
  expect(
    toolData(await client.callTool({ name: "get_configuration", arguments: {} }), catalogSchema)
      .storeId,
  ).toBe("tablecast-store");
  toolError(await client.callTool({ name: "create_draft", arguments: {} }), "WRITE_SCOPE_REQUIRED");
  toolError(
    await client.callTool({
      name: "upload_image",
      arguments: {
        mimeType: "image/png",
        data: "AAAA",
        imageKind: "illustration",
        imageSource: { generated: true, description: "生成画像" },
      },
    }),
    "WRITE_SCOPE_REQUIRED",
  );
  expect((await env.TABLECAST_MEDIA.list({ prefix: "tablecast/uploads/" })).objects).toHaveLength(
    0,
  );
  expect(
    await env.TABLECAST_DB.prepare("SELECT COUNT(*) AS count FROM config_drafts").first("count"),
  ).toBe(0);
});

it("MCPはOAuth対象店舗・現行roleを要求ごとに照合する", async () => {
  const { cookie, staff } = await setupFixture();
  const { token } = await authorise(cookie);
  const client = await connect(token);
  toolData(await client.callTool({ name: "create_draft", arguments: {} }), configDraftSchema);
  await env.TABLECAST_DB.batch([
    insertFixture(authTables.organization, {
      id: "tablecast-other-org",
      name: "別組織",
      slug: "tablecast-other-org",
      createdAt: new Date(),
    }),
    insertFixture(authTables.member, {
      id: "tablecast-other-member",
      organizationId: "tablecast-other-org",
      userId: staff.userId,
      role: "owner",
      createdAt: new Date(),
    }),
    insertFixture(businessTables.stores, {
      id: "tablecast-other-org-store",
      organization_id: "tablecast-other-org",
      name: "別組織店",
      config_json: JSON.stringify(fixtureConfiguration),
      updated_at: Date.now(),
    }),
  ]);
  await expect(connect(token, "tablecast-other-org-store")).rejects.toMatchObject({ code: 403 });
  await env.TABLECAST_DB.batch([
    env.TABLECAST_DB.prepare(
      "UPDATE member SET role='member' WHERE organization_id='tablecast-org' AND user_id=?",
    ).bind(staff.userId),
  ]);
  expect(
    toolData(await client.callTool({ name: "get_configuration", arguments: {} }), catalogSchema)
      .storeId,
  ).toBe("tablecast-store");
  toolError(await client.callTool({ name: "create_draft", arguments: {} }), "ADMIN_REQUIRED");
  toolError(
    await client.callTool({
      name: "upload_image",
      arguments: {
        mimeType: "image/png",
        data: "AAAA",
        imageKind: "illustration",
        imageSource: { generated: true, description: "生成画像" },
      },
    }),
    "ADMIN_REQUIRED",
  );
  await env.TABLECAST_DB.prepare(
    "DELETE FROM member WHERE organization_id='tablecast-org' AND user_id=?",
  )
    .bind(staff.userId)
    .run();
  await expect(client.callTool({ name: "get_configuration", arguments: {} })).rejects.toMatchObject(
    { code: 403 },
  );
});

it("読み取りOAuthから共通のGPT-Live標準音声一覧を資格なしで取得する", async () => {
  const { cookie } = await setupFixture();
  const { token } = await authorise(cookie, "tablecast:read");
  const client = await connect(token, "tablecast-store", env);
  const page = toolData(
    await client.callTool({ name: "list_voices", arguments: { locale: "en" } }),
    voicePageSchema,
  );
  expect(page).toEqual({
    voices: [
      { voiceId: "marin", displayName: "Marin", langCode: "en" },
      { voiceId: "cedar", displayName: "Cedar", langCode: "en" },
    ],
    nextPageToken: null,
  });
  expect(
    (await client.listTools()).tools.find((tool) => tool.name === "list_voices")?.annotations
      ?.readOnlyHint,
  ).toBe(true);
});

it("未ログインのMCPクライアントは公開クライアント登録できるが店舗トークンを得ない", async () => {
  const response = await exports.default.fetch(
    new Request("http://localhost:3000/api/auth/oauth2/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "TableCast Codex acceptance",
        application_type: "native",
        redirect_uris: ["http://127.0.0.1:54321/callback"],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code"],
        response_types: ["code"],
        scope: "tablecast:read",
      }),
    }),
  );
  expect(response.status).toBe(201);
  const client = z.object({ client_id: z.string() }).parse(await response.json());
  expect(client.client_id).toBeTruthy();
  expect(response.headers.getSetCookie().join()).not.toContain("session_token");
});

it("アカウントのMCP連携一覧は承認scopeと日時を返し、取消後は既存tokenを拒否する", async () => {
  // Given: 店長が外部アプリへ店舗の読み取りを承認する。
  const { cookie } = await setupFixture();
  const { token } = await authorise(cookie, "tablecast:read");
  const client = await connect(token);
  const response = await exports.default.fetch(
    new Request(origin + "/api/account/mcp-sessions", { headers: { Cookie: cookie } }),
  );
  expect(response.status).toBe(200);
  const data = z
    .object({
      sessions: z.array(
        z.object({
          id: z.string(),
          scopes: z.array(z.string()),
          createdAt: z.number(),
          updatedAt: z.number(),
        }),
      ),
    })
    .parse(await response.json());
  const session = data.sessions[0];
  expect(session?.scopes).toContain("tablecast:read");
  if (!session) throw new Error("承認がありません。");
  // When: ユーザーが連携を取り消す。
  const revoke = await exports.default.fetch(
    new Request(origin + `/api/account/mcp-sessions/${session.id}/revoke`, {
      method: "POST",
      headers: { Cookie: cookie, Origin: origin },
    }),
  );
  expect(revoke.status).toBe(200);
  // Then: アクセストークンの期限前でも既存接続からツールを呼べない。
  await expect(client.callTool({ name: "get_configuration", arguments: {} })).rejects.toMatchObject(
    { code: 401 },
  );
});
