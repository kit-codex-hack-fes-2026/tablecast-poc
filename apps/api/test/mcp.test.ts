import { env, exports } from "cloudflare:workers";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { expect, it, onTestFinished } from "vitest";
import { z } from "zod";
import { createAuth } from "../src/auth";
import { catalogSchema, configDraftSchema, configurationSchema } from "../src/schema";
import { setupFixture, text } from "./fixture";

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

async function connect(token: string, storeId = "tablecast-store") {
  const client = new Client({ name: "tablecast-integration", version: "1.0.0" });
  onTestFinished(() => client.close());
  await client.connect(
    new StreamableHTTPClientTransport(
      new URL(`${origin}/mcp?storeId=${encodeURIComponent(storeId)}`),
      {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
        fetch: (url, init) => exports.default.fetch(new Request(url, init)),
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

it("MCPで日英設定を下書き・検証し、公開は人の管理sessionと対象版でのみ完了する", async () => {
  const { cookie } = await setupFixture();
  const { token } = await authorise(cookie);
  const client = await connect(token);
  const tools = await client.listTools();
  expect(tools.tools.map((tool) => tool.name)).not.toContain("publish_draft");
  const published = toolData(
    await client.callTool({ name: "get_configuration", arguments: {} }),
    catalogSchema,
  );
  let draft = toolData(
    await client.callTool({ name: "create_draft", arguments: {} }),
    configDraftSchema,
  );
  const configuration = configurationSchema.parse({
    ...published.configuration,
    products: published.configuration.products.map((product) =>
      product.id === "tea"
        ? {
            ...product,
            price: 450,
            text: {
              ja: { ...product.text.ja, displayName: "焙じ茶", speechName: "ほうじちゃ" },
              en: {
                ...product.text.en,
                displayName: "Roasted tea",
                speechName: "Roasted tea",
                description: "A mellow roasted tea.",
              },
            },
          }
        : product,
    ),
    plans: [
      {
        id: "tablecast-tea-plan",
        text: text("お茶プラン", "Tea plan"),
        pricePerPerson: 1000,
        durationMinutes: 90,
        lastOrderMinutesBeforeEnd: 10,
        productIds: ["tablecast-missing-product"],
        categoryIds: [],
        tags: [],
        maxPerOrder: 3,
        maxTotalPerPerson: 10,
        intervalSeconds: 30,
        excludedOptionIds: [],
        includedOptionSurcharge: true,
      },
    ],
    cast: {
      ...published.configuration.cast,
      instructions: {
        ja: "料理の文化を短く説明する",
        en: "Briefly explain the cultural background of the dishes.",
      },
      proactive: true,
    },
  });
  draft = toolData(
    await client.callTool({
      name: "update_draft",
      arguments: { draftId: draft.id, expectedVersion: draft.version, configuration },
    }),
    configDraftSchema,
  );
  const invalid = toolData(
    await client.callTool({
      name: "validate_draft",
      arguments: { draftId: draft.id, expectedVersion: draft.version },
    }),
    configDraftSchema,
  );
  expect(invalid.status).toBe("draft");
  expect(invalid.errors).toContain("tablecast-tea-plan: 商品がありません");
  configuration.plans = configuration.plans.map((plan) => ({ ...plan, productIds: ["tea"] }));
  draft = toolData(
    await client.callTool({
      name: "update_draft",
      arguments: { draftId: draft.id, expectedVersion: draft.version, configuration },
    }),
    configDraftSchema,
  );
  toolError(
    await client.callTool({
      name: "update_draft",
      arguments: { draftId: draft.id, expectedVersion: draft.version - 1, configuration },
    }),
    "DRAFT_CONFLICT",
  );
  const ready = toolData(
    await client.callTool({
      name: "validate_draft",
      arguments: { draftId: draft.id, expectedVersion: draft.version },
    }),
    configDraftSchema,
  );
  expect(ready.status).toBe("ready");
  const difference = toolData(
    await client.callTool({ name: "get_draft_diff", arguments: { draftId: draft.id } }),
    configDraftSchema,
  );
  expect(difference.configuration).toEqual(configuration);
  expect(
    difference.changes.some((change) => change.path.includes("price") && change.sensitive),
  ).toBe(true);
  expect(difference.changes.some((change) => change.path.includes("speechName"))).toBe(true);
  const approval = toolData(
    await client.callTool({
      name: "request_publication",
      arguments: { draftId: draft.id, expectedVersion: draft.version, approved: true },
    }),
    z.object({ status: z.literal("human_approval_required"), reviewUrl: z.string() }),
  );
  expect(approval.reviewUrl).toBe(
    `${origin}/admin/live?storeId=tablecast-store&draftId=${draft.id}`,
  );
  toolError(
    await client.callTool({
      name: "request_publication",
      arguments: { draftId: draft.id, expectedVersion: draft.version - 1 },
    }),
    "DRAFT_NOT_READY",
  );
  toolError(
    await client.callTool({
      name: "publish_draft",
      arguments: { draftId: draft.id, approved: true },
    }),
    "not found",
  );
  expect(
    toolData(await client.callTool({ name: "get_configuration", arguments: {} }), catalogSchema),
  ).toEqual(published);
  const payload = {
    expectedVersion: draft.version,
    baseVersion: draft.baseVersion,
    idempotencyKey: "tablecast-mcp-human-publication",
    approved: true,
  };
  expect(
    (
      await post(`/api/admin/stores/tablecast-store/drafts/${draft.id}/publish`, payload, {
        Authorization: `Bearer ${token}`,
      })
    ).status,
  ).toBe(401);
  const response = await post(
    `/api/admin/stores/tablecast-store/drafts/${draft.id}/publish`,
    payload,
    { Cookie: cookie },
  );
  expect(response.status).toBe(200);
  expect(configDraftSchema.parse(await response.json()).status).toBe("published");
  const current = toolData(
    await client.callTool({ name: "get_configuration", arguments: {} }),
    catalogSchema,
  );
  expect(current.version).toBe(published.version + 1);
  expect(current.configuration).toEqual(configuration);
});

it("読み取りだけのOAuth委譲では、管理者でもMCPの書き込みを拒否する", async () => {
  const { cookie } = await setupFixture();
  const { token } = await authorise(cookie, "tablecast:read");
  const client = await connect(token);
  expect(
    toolData(await client.callTool({ name: "get_configuration", arguments: {} }), catalogSchema)
      .storeId,
  ).toBe("tablecast-store");
  toolError(await client.callTool({ name: "create_draft", arguments: {} }), "WRITE_SCOPE_REQUIRED");
  expect(
    await env.TABLECAST_DB.prepare("SELECT COUNT(*) AS count FROM config_drafts").first("count"),
  ).toBe(0);
});

it("MCPはOAuth対象組織・店舗team・現行roleを要求ごとに照合する", async () => {
  const { cookie, staff } = await setupFixture();
  const { token } = await authorise(cookie);
  const client = await connect(token);
  const draft = toolData(
    await client.callTool({ name: "create_draft", arguments: {} }),
    configDraftSchema,
  );
  await env.TABLECAST_DB.batch([
    env.TABLECAST_DB.prepare(
      "INSERT INTO organization(id,name,slug,created_at) VALUES('tablecast-other-org','別組織','tablecast-other-org',?)",
    ).bind(Date.now()),
    env.TABLECAST_DB.prepare(
      "INSERT INTO member(id,organization_id,user_id,role,created_at) VALUES('tablecast-other-member','tablecast-other-org',?,'owner',?)",
    ).bind(staff.userId, Date.now()),
    env.TABLECAST_DB.prepare(
      "INSERT INTO stores(id,organization_id,name,config_json,updated_at) SELECT 'tablecast-other-org-store','tablecast-other-org','別組織店',config_json,updated_at FROM stores WHERE id='tablecast-store'",
    ),
    env.TABLECAST_DB.prepare(
      "INSERT INTO stores(id,organization_id,name,config_json,updated_at) SELECT 'tablecast-other-store',organization_id,'別店舗',config_json,updated_at FROM stores WHERE id='tablecast-store'",
    ),
  ]);
  await expect(connect(token, "tablecast-other-org-store")).rejects.toMatchObject({ code: 403 });
  const other = await connect(token, "tablecast-other-store");
  toolError(
    await other.callTool({ name: "get_draft_diff", arguments: { draftId: draft.id } }),
    "DRAFT_NOT_FOUND",
  );
  await env.TABLECAST_DB.batch([
    env.TABLECAST_DB.prepare(
      "INSERT INTO team(id,name,organization_id,created_at) VALUES('tablecast-own-team','担当店','tablecast-org',?)",
    ).bind(Date.now()),
    env.TABLECAST_DB.prepare(
      "INSERT INTO team_member(id,team_id,user_id,created_at) VALUES('tablecast-own-team-member','tablecast-own-team',?,?)",
    ).bind(staff.userId, Date.now()),
    env.TABLECAST_DB.prepare(
      "UPDATE stores SET team_id='tablecast-own-team' WHERE id='tablecast-store'",
    ),
    env.TABLECAST_DB.prepare(
      "UPDATE member SET role='member' WHERE organization_id='tablecast-org' AND user_id=?",
    ).bind(staff.userId),
  ]);
  expect(
    toolData(await client.callTool({ name: "get_configuration", arguments: {} }), catalogSchema)
      .storeId,
  ).toBe("tablecast-store");
  toolError(await client.callTool({ name: "create_draft", arguments: {} }), "ADMIN_REQUIRED");
  await expect(other.callTool({ name: "get_configuration", arguments: {} })).rejects.toMatchObject({
    code: 403,
  });
});
