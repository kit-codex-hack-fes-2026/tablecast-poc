import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { env, exports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, expect, it, onTestFinished, vi } from "vitest";
import { z } from "zod";
import app from "../src/app";
import * as authTables from "../src/db/auth-schema";
import * as businessTables from "../src/db/business-schema";
import { createAuth } from "../src/modules/auth/service";
import { couponRuleSchema, statisticsResultSchema } from "../src/schema";
import { fixtureDb } from "./database-fixture";
import { setupFixture } from "./fixture";
import { addStatisticsSession, statisticsPeriod } from "./statistics-fixture";

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

it("特典MCPは会員の表示名と券の状態だけをページ取得し、管理HTTPの人物情報と権限を保つ", async () => {
  const { cookie, staff } = await setupFixture();
  const issuedAt = Date.now();
  const rules = couponRuleSchema.parse({
    title: { ja: "ご来店特典", en: "Visit reward" },
    description: { ja: "100円引き", en: "JPY 100 off" },
    imageKey: `tablecast/uploads/${"a".repeat(64)}.webp`,
    imageKind: "illustration",
    imageSource: { generated: false, description: "テスト券面" },
    startsAt: issuedAt - 10000,
    endsAt: issuedAt + 86400000,
    minimumYen: 100,
    discountKind: "fixed",
    discountValue: 100,
    maximumYen: 500,
    trigger: "manual",
    threshold: 1,
  });
  await fixtureDb.insert(businessTables.customerCouponRules).values({
    id: "tablecast-reward-rule",
    storeId: "tablecast-store",
    version: 1,
    active: true,
    rulesJson: JSON.stringify(rules),
    createdAt: issuedAt,
    updatedAt: issuedAt,
    createdBy: staff.userId,
  });
  for (const [index, state] of (["available", "revoked"] as const).entries()) {
    const id = `tablecast-reward-${index}`;
    await fixtureDb.batch([
      fixtureDb.insert(authTables.user).values({
        id,
        name: `会員${index}`,
        email: `${id}@example.test`,
        image: `https://example.test/${id}.png`,
      }),
      fixtureDb.insert(businessTables.customerMemberships).values({
        id,
        userId: id,
        storeId: "tablecast-store",
        shareCompanions: false,
        useMemories: false,
        saveMemories: false,
        consentVersion: 1,
        joinedAt: issuedAt,
        updatedAt: issuedAt,
      }),
      fixtureDb.insert(businessTables.customerCoupons).values({
        id,
        storeId: "tablecast-store",
        membershipId: id,
        ruleId: "tablecast-reward-rule",
        ruleVersion: 1,
        snapshotJson: JSON.stringify(rules),
        state,
        issuanceKey: id,
        mutationId: id,
        createdAt: issuedAt,
      }),
    ]);
  }
  const { token } = await authorise(cookie, "tablecast:read");
  const client = await connect(token);
  const memberPageSchema = z.strictObject({
    members: z.array(z.strictObject({ id: z.string(), name: z.string() })),
    nextCursor: z.string().nullable(),
  });
  const couponPageSchema = z.strictObject({
    coupons: z.array(
      z.strictObject({
        id: z.string(),
        name: z.string(),
        state: z.enum(["available", "requested", "used", "revoked"]),
        issuedAt: z.number(),
        rules: couponRuleSchema,
      }),
    ),
    nextCursor: z.string().nullable(),
  });
  for (const index of [1, 0]) {
    const id = `tablecast-reward-${index}`;
    const args = { limit: 1, ...(index === 0 ? { beforeId: "tablecast-reward-1" } : {}) };
    const nextCursor = index === 1 ? id : null;
    expect(
      toolData(
        await client.callTool({ name: "list_reward_members", arguments: args }),
        memberPageSchema,
      ),
    ).toEqual({ members: [{ id, name: `会員${index}` }], nextCursor });
    expect(
      toolData(
        await client.callTool({ name: "list_issued_coupons", arguments: args }),
        couponPageSchema,
      ),
    ).toEqual({
      coupons: [
        { id, name: `会員${index}`, state: index === 1 ? "revoked" : "available", issuedAt, rules },
      ],
      nextCursor,
    });
  }
  expect(
    toolData(
      await client.callTool({ name: "list_reward_members", arguments: { query: "会員0" } }),
      memberPageSchema,
    ),
  ).toEqual({ members: [{ id: "tablecast-reward-0", name: "会員0" }], nextCursor: null });
  const audience = toolData(
    await client.callTool({
      name: "preview_coupon_audience",
      arguments: {
        rules: {
          ...rules,
          conditions: { all: [{ field: "visits", operator: "lte", value: 0 }], any: [] },
        },
      },
    }),
    z.strictObject({
      totalMembers: z.number(),
      eligible: z.number(),
      alreadyIssued: z.number(),
      notMatching: z.number(),
      evaluatedAt: z.number(),
      issuance: z.literal("manual"),
    }),
  );
  expect(audience).toMatchObject({
    totalMembers: 2,
    eligible: 2,
    alreadyIssued: 0,
    notMatching: 0,
  });
  expect(
    (await client.listTools()).tools.find((tool) => tool.name === "preview_coupon_audience")
      ?.annotations?.readOnlyHint,
  ).toBe(true);
  const previewHttp = await post(
    "/api/admin/stores/tablecast-store/coupons/audience",
    {
      rules: {
        ...rules,
        conditions: { all: [{ field: "visits", operator: "lte", value: 0 }], any: [] },
      },
    },
    { Cookie: cookie },
  );
  expect(previewHttp.status).toBe(200);
  expect(await previewHttp.json()).toMatchObject({
    totalMembers: 2,
    eligible: 2,
    alreadyIssued: 0,
    notMatching: 0,
    issuance: "manual",
  });
  for (const [path, key] of [
    ["members", "members"],
    ["issued", "coupons"],
  ] as const) {
    const response = await exports.default.fetch(
      new Request(`${origin}/api/admin/stores/tablecast-store/coupons/${path}?limit=1`, {
        headers: { Cookie: cookie },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      [key]: [
        {
          id: "tablecast-reward-1",
          email: "tablecast-reward-1@example.test",
          image: "https://example.test/tablecast-reward-1.png",
        },
      ],
      nextCursor: "tablecast-reward-1",
    });
  }
  await fixtureDb.delete(authTables.member).where(eq(authTables.member.id, "tablecast-member"));
  for (const name of ["list_reward_members", "list_issued_coupons"]) {
    await expect(client.callTool({ name, arguments: {} })).rejects.toMatchObject({ code: 403 });
  }
});

it("統計MCPは読取りscopeでHTTPと同じ集計を返し、権限変更と失効を検証する", async () => {
  const { cookie, staff } = await setupFixture();
  await addStatisticsSession(staff, {
    id: "statistics-mcp",
    closedAt: Date.parse(statisticsPeriod.from),
    orders: [{ productId: "tea", quantity: 2 }],
  });
  const { token } = await authorise(cookie, "tablecast:read");
  const client = await connect(token);
  const response = toolData(
    await client.callTool({
      name: "get_statistics",
      arguments: { ...statisticsPeriod, view: "products" },
    }),
    statisticsResultSchema,
  );
  const http = await exports.default.fetch(
    new Request(
      `${origin}/api/admin/stores/${staff.storeId}/statistics?${new URLSearchParams({ ...statisticsPeriod, view: "products" }).toString()}`,
      { headers: { Cookie: cookie } },
    ),
  );
  const data = statisticsResultSchema.parse(await http.json());
  expect(response.summary).toEqual(data.summary);
  expect(response.rows).toEqual(data.rows);
  expect(response.rows[0]).toMatchObject({ quantity: 2, orderRate: 1 });
  expect(
    (await client.listTools()).tools.find((tool) => tool.name === "get_statistics")?.annotations
      ?.readOnlyHint,
  ).toBe(true);
  toolError(await client.callTool({ name: "create_draft", arguments: {} }), "WRITE_SCOPE_REQUIRED");
  await expect(connect(token, "other-store")).rejects.toBeDefined();
  await fixtureDb
    .update(authTables.member)
    .set({ role: "member" })
    .where(eq(authTables.member.id, "tablecast-member"));
  toolError(
    await client.callTool({ name: "get_statistics", arguments: statisticsPeriod }),
    "ADMIN_REQUIRED",
  );
  await fixtureDb
    .update(authTables.member)
    .set({ role: "owner" })
    .where(eq(authTables.member.id, "tablecast-member"));
  const sessions = await exports.default.fetch(
    new Request(`${origin}/api/account/mcp-sessions`, { headers: { Cookie: cookie } }),
  );
  const session = z
    .object({ sessions: z.array(z.object({ id: z.string() })) })
    .parse(await sessions.json()).sessions[0];
  if (!session) throw new Error("MCP接続がありません");
  expect(
    (await post(`/api/account/mcp-sessions/${session.id}/revoke`, {}, { Cookie: cookie })).status,
  ).toBe(200);
  await expect(
    client.callTool({ name: "get_statistics", arguments: statisticsPeriod }),
  ).rejects.toMatchObject({ code: 401 });
});
