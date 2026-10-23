import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { env, exports } from "cloudflare:workers";
import { afterEach, expect, it, onTestFinished, vi } from "vitest";
import { z } from "zod";
import app from "../src/app";
import { createAuth } from "../src/modules/auth/service";
import { uploadedImageSchema } from "../src/schema";
import { setupFixture } from "./fixture";

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

it("2MiBを超える画像データをMCPから取り込み、JSON本文上限では拒否しない", async () => {
  const { cookie } = await setupFixture();
  const { token } = await authorise(cookie);
  const client = await connect(token);
  const bytes = new Uint8Array(5 * 1024 * 1024);
  bytes.set(
    Uint8Array.fromBase64(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
    ),
  );
  const uploaded = toolData(
    await client.callTool({
      name: "upload_image",
      arguments: {
        data: bytes.toBase64(),
        mimeType: "image/png",
        imageKind: "photograph",
        imageSource: { generated: false, description: "店舗の写真" },
      },
    }),
    uploadedImageSchema,
  );
  expect(uploaded.imageKind).toBe("photograph");
  expect(await env.TABLECAST_MEDIA.head(uploaded.imageKey)).not.toBeNull();
});
