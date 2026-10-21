import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { env, exports } from "cloudflare:workers";
import { afterEach, expect, it, onTestFinished, vi } from "vitest";
import { z } from "zod";
import app from "../src/app";
import { createAuth } from "../src/modules/auth/service";
import { gamePackageSchema } from "../src/schema";
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

it("OAuth接続したMCPでゲーム仕様を取得し、登録・検証しても人間の承認までは公開されない", async () => {
  const { cookie } = await setupFixture();
  const { token } = await authorise(cookie);
  const client = await connect(token);
  const spec = toolData(
    await client.callTool({ name: "get_game_spec", arguments: {} }),
    z.object({
      protocol: z.literal(1),
      instructions: z.array(z.string()),
      schema: z.object({
        required: z.array(z.string()),
        properties: z.record(z.string(), z.unknown()),
      }),
    }),
  );
  expect(spec.schema.required).toEqual(
    expect.arrayContaining(["manifest", "html", "css", "javascript"]),
  );
  expect(Object.keys(spec.schema.properties)).toEqual(
    expect.arrayContaining(["manifest", "html", "css", "javascript"]),
  );
  const tools = await client.listTools();
  expect(
    tools.tools
      .filter((tool) => /game/.test(tool.name))
      .map((tool) => tool.name)
      .toSorted(),
  ).toEqual([
    "get_game",
    "get_game_source",
    "get_game_spec",
    "list_games",
    "register_game",
    "validate_game",
  ]);
  const registered = toolData(
    await client.callTool({
      name: "register_game",
      arguments: {
        gameId: "tablecast-mcp-game",
        package: {
          manifest: {
            apiVersion: 1,
            name: { ja: "卓上対戦", en: "Table match" },
            description: { ja: "交代で遊ぶ", en: "Take turns" },
            rules: { ja: "結果を比べる", en: "Compare results" },
            minPlayers: 2,
            maxPlayers: 6,
            capabilities: ["state"],
          },
          html: "<button>終了</button>",
          css: "",
          javascript: "tablecast.ready.then(() => tablecast.exit());",
        },
      },
    }),
    z.object({ gameId: z.string(), versionId: z.uuid(), status: z.literal("draft") }),
  );
  const source = toolData(
    await client.callTool({
      name: "get_game_source",
      arguments: { gameId: registered.gameId, versionId: registered.versionId },
    }),
    z.object({ package: gamePackageSchema }),
  );
  expect(source.package).toMatchObject({
    html: "<button>終了</button>",
    css: "",
    javascript: "tablecast.ready.then(() => tablecast.exit());",
    manifest: { capabilities: ["state"], minPlayers: 2, maxPlayers: 6 },
  });
  const validated = toolData(
    await client.callTool({
      name: "validate_game",
      arguments: { gameId: registered.gameId, versionId: registered.versionId },
    }),
    z.object({ valid: z.literal(true), requiresPreview: z.literal(true), reviewUrl: z.url() }),
  );
  expect(new URL(validated.reviewUrl).pathname).toBe("/admin/stores/tablecast-store/games");
  const game = toolData(
    await client.callTool({ name: "get_game", arguments: { gameId: registered.gameId } }),
    z.object({
      activeVersionId: z.null(),
      versions: z.array(z.object({ status: z.literal("ready"), previewed: z.literal(false) })),
    }),
  );
  expect(game.versions).toHaveLength(1);
});
