import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { env } from "cloudflare:workers";
import { expect, onTestFinished, vi } from "vitest";
import { z } from "zod";
import app from "../src/app";
import { createAuth } from "../src/modules/auth/service";
import { posMappingSchema, posSettingsSchema } from "../src/modules/pos/model";

const origin = "http://localhost:3000";

// 実際のOAuth・PKCE・同意でtokenを発行し、MCPの認証を迂回しない。
export async function authorisePos(cookie: string, scope = "tablecast:read tablecast:write") {
  const auth = createAuth(env);
  const headers = new Headers({ Cookie: cookie, Origin: origin });
  await auth.api.setActiveOrganization({ body: { organizationId: "tablecast-org" }, headers });
  const registered = await auth.api.createOAuthClient({
    body: {
      client_name: "TableCast POS MCP試験",
      redirect_uris: ["http://127.0.0.1:6274/oauth/callback"],
      scope,
      token_endpoint_auth_method: "none",
      application_type: "native",
    },
    headers,
  });
  const verifier = "tablecast-pos-proof-key-0123456789-abcdefghijklmnopqrstuvwxyz-0123456789";
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  const query = new URLSearchParams({
    client_id: registered.client_id,
    response_type: "code",
    redirect_uri: "http://127.0.0.1:6274/oauth/callback",
    scope,
    resource: origin + "/mcp",
    code_challenge: btoa(String.fromCharCode(...digest))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", ""),
    code_challenge_method: "S256",
    state: "tablecast-pos-mcp-state",
  });
  const response = await app.fetch(
    new Request(`${origin}/api/auth/oauth2/authorize?${query.toString()}`, {
      headers,
      redirect: "manual",
    }),
    env,
  );
  expect([200, 302, 303]).toContain(response.status);
  const redirect =
    response.headers.get("Location") ??
    z.object({ url: z.string() }).parse(await response.json()).url;
  const consent = await app.fetch(
    new Request(origin + "/api/auth/oauth2/consent", {
      method: "POST",
      headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        accept: true,
        oauth_query: new URL(redirect, origin).search.slice(1),
      }),
    }),
    env,
  );
  expect(consent.status).toBe(200);
  const callback = new URL(z.object({ url: z.string() }).parse(await consent.json()).url);
  const code = callback.searchParams.get("code");
  if (!code) throw new Error("POS MCP試験の認可コードがありません");
  const token = await app.fetch(
    new Request(origin + "/api/auth/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: registered.client_id,
        redirect_uri: "http://127.0.0.1:6274/oauth/callback",
        code,
        code_verifier: verifier,
        resource: origin + "/mcp",
      }),
    }),
    env,
  );
  expect(token.status).toBe(200);
  return z.object({ access_token: z.string() }).parse(await token.json()).access_token;
}

export async function connectPos(
  token: string,
  bindings: TablecastEnv = env,
  storeId = "tablecast-store",
) {
  const client = new Client({ name: "tablecast-pos-integration", version: "1.0.0" });
  onTestFinished(() => client.close());
  await client.connect(
    new StreamableHTTPClientTransport(
      new URL(`${origin}/mcp?storeId=${encodeURIComponent(storeId)}`),
      {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
        fetch: (url, init) => Promise.resolve(app.fetch(new Request(url, init), bindings)),
      },
    ),
  );
  return client;
}

export function posToolData<T>(value: unknown, schema: z.ZodType<T>): T {
  const parsed = CallToolResultSchema.parse(value);
  expect(parsed.isError).not.toBe(true);
  const first = parsed.content[0];
  if (first?.type !== "text") throw new Error("POS MCP応答がJSON textではありません");
  const data: unknown = JSON.parse(first.text);
  expect(parsed.structuredContent).toEqual(data);
  return schema.parse(data);
}

export function posToolError(value: unknown, code: string) {
  const parsed = CallToolResultSchema.parse(value);
  expect(parsed.isError).toBe(true);
  const first = parsed.content[0];
  if (first?.type !== "text") throw new Error("POS MCPエラー応答がtextではありません");
  expect(first.text).toContain(code);
}

export function posCatalogHttp() {
  const calls: URL[] = [];
  const objects = [
    ...[
      ["tea", "煎茶 原名", "標準 / 店舗限定", 400],
      ["coffee", "咖啡", "大杯", 500],
    ].map(([id, name, variation, price]) => ({
      type: "ITEM",
      id: `square-item-${id}`,
      item_data: {
        name,
        modifier_list_info: id === "coffee" ? [{ modifier_list_id: "square-milk" }] : [],
        variations: [
          {
            type: "ITEM_VARIATION",
            id: `square-${id}`,
            item_variation_data: {
              item_id: `square-item-${id}`,
              name: variation,
              price_money: { amount: price, currency: "JPY" },
            },
          },
        ],
      },
    })),
    {
      type: "MODIFIER_LIST",
      id: "square-milk",
      modifier_list_data: {
        modifiers: [
          {
            type: "MODIFIER",
            id: "square-dairy",
            modifier_data: {
              modifier_list_id: "square-milk",
              name: "牛乳",
              price_money: { amount: 0, currency: "JPY" },
            },
          },
          {
            type: "MODIFIER",
            id: "square-oat",
            modifier_data: {
              modifier_list_id: "square-milk",
              name: "燕麥奶",
              price_money: { amount: 100, currency: "JPY" },
            },
          },
        ],
      },
    },
  ];
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    expect(url.origin).toBe("https://connect.squareupsandbox.com");
    expect(request.headers.get("authorization")).toBe("Bearer tablecast-square-access-token");
    calls.push(url);
    if (request.method === "GET" && url.pathname === "/v2/locations")
      return Promise.resolve(
        Response.json({
          locations: [
            { id: "square-location", name: "日本店 原名", currency: "JPY", status: "ACTIVE" },
          ],
        }),
      );
    if (request.method === "GET" && url.pathname === "/v2/catalog/list")
      return Promise.resolve(
        Response.json({ objects: calls.length % 4 === 0 ? objects.toReversed() : objects }),
      );
    throw new Error(`未定義のPOS MCP外部要求: ${request.method} ${url.pathname}`);
  });
  return calls;
}

export const posLocalPage = z.object({
  publishedVersion: posSettingsSchema.shape.publishedVersion,
  draft: posSettingsSchema.shape.draft,
  mappingConnectionId: posSettingsSchema.shape.mappingConnectionId,
  connection: posSettingsSchema.shape.connection,
  configured: z.boolean(),
  storeId: z.string(),
  settingsUrl: z.string(),
  section: z.enum(["items", "mappings", "legacyMappings"]),
  total: z.number(),
  nextCursor: z.string().nullable(),
  items: z.array(
    z.object({
      kind: z.enum(["product", "option"]),
      id: z.string(),
      productId: z.string().nullable(),
      name: posSettingsSchema.shape.products.element.shape.name,
      price: z.number(),
      available: z.boolean().nullable(),
    }),
  ),
  mappings: z.array(posMappingSchema),
});

export const posMappings = [
  { kind: "product", localId: "tea", externalId: "square-tea" },
  { kind: "product", localId: "coffee", externalId: "square-coffee" },
  { kind: "option", localId: "dairy", externalId: "square-dairy" },
  { kind: "option", localId: "oat", externalId: "square-oat" },
] satisfies z.infer<typeof posMappingSchema>[];
