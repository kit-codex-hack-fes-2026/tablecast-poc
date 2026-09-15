import { eq } from "drizzle-orm";
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
import { priceCart } from "../src/modules/catalog/pricing";
import {
  statisticsResultSchema,
  catalogSchema,
  configDraftSchema,
  configurationSchema,
  voicePageSchema,
  uploadedImageSchema,
  gamePackageSchema,
} from "../src/schema";
import { addStatisticsSession, statisticsPeriod } from "./statistics-fixture";
import { fixtureDb, insertFixture } from "./database-fixture";
import { configuration as fixtureConfiguration, setupFixture, text } from "./fixture";

afterEach(() => vi.restoreAllMocks());

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

it("架空の二郎系店舗を店名・生成画像・マシマシ・日英接客付きの検証済み下書きにする", async () => {
  const { cookie } = await setupFixture();
  const { token } = await authorise(cookie);
  const client = await connect(token);
  const published = toolData(
    await client.callTool({ name: "get_configuration", arguments: {} }),
    catalogSchema,
  );
  const descriptor = (await client.listTools()).tools.find((tool) => tool.name === "upload_image");
  expect(descriptor).toMatchObject({ _meta: { "openai/fileParams": ["file"] } });
  expect(descriptor?.inputSchema.properties?.file).toMatchObject({
    properties: {
      download_url: { type: "string" },
      file_id: { type: "string" },
      mime_type: { type: "string" },
      file_name: { type: "string" },
    },
    required: ["download_url", "file_id"],
  });
  const downloadUrl =
    "https://files.oaiusercontent.com/tablecast-generated-ramen?sig=tablecast-test-signature";
  const provider = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    expect(url instanceof Request ? url.url : url.toString()).toBe(downloadUrl);
    expect(init?.redirect).toBe("manual");
    expect(init?.headers).toBeUndefined();
    return new Response(
      Uint8Array.fromBase64(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
      ),
      { headers: { "Content-Type": "image/png" } },
    );
  });
  const image = toolData(
    await client.callTool({
      name: "upload_image",
      arguments: {
        file: { download_url: downloadUrl, file_id: "file-tablecast-ramen" },
        imageKind: "illustration",
        imageSource: { generated: true, description: "架空店の二郎系ラーメンを描いた生成イメージ" },
      },
    }),
    uploadedImageSchema,
  );
  let draft = toolData(
    await client.callTool({ name: "create_draft", arguments: {} }),
    configDraftSchema,
  );
  const configuration = configurationSchema.parse({
    storeName: "麺屋 マシの頂",
    categories: [{ id: "ramen", text: text("ラーメン", "Ramen") }],
    products: [
      { id: "ramen", ja: "ラーメン", en: "Ramen", price: 1000 },
      { id: "pork-ramen", ja: "豚入りラーメン", en: "Ramen with extra pork", price: 1300 },
      { id: "soupless", ja: "汁なし", en: "Brothless ramen", price: 1100 },
    ].map((product) => ({
      id: product.id,
      categoryId: "ramen",
      text: text(product.ja, product.en),
      price: product.price,
      available: true,
      imageKey: image.imageKey,
      imageKind: image.imageKind,
      imageSource: image.imageSource,
      allergens: {
        contains: [],
        evidence: "unknown",
        crossContact: "unknown",
        vegan: "unknown",
        note: {
          ja: "試作設定。原材料はスタッフに確認してください。",
          en: "Sample menu. Please ask staff about ingredients.",
        },
      },
      modifiers: [
        { id: "noodles", ja: "麺量", en: "Noodle portion" },
        { id: "vegetables", ja: "野菜", en: "Vegetables" },
        { id: "garlic", ja: "ニンニク", en: "Garlic" },
        { id: "fat", ja: "アブラ", en: "Pork fat" },
        { id: "sauce", ja: "カラメ", en: "Seasoning" },
      ].map((group) => ({
        id: group.id,
        text: text(group.ja, group.en),
        kind: "single",
        min: 1,
        max: 1,
        options: [
          { id: "normal", ja: "普通", en: "Regular", extra: 0 },
          { id: "mashi", ja: "マシ", en: "Extra", extra: 100 },
          { id: "mashimashi", ja: "マシマシ", en: "Double extra", extra: 200 },
        ].map((option) => ({
          id: `${group.id}-${option.id}`,
          text: text(option.ja, option.en),
          priceDelta: group.id === "noodles" ? option.extra : 0,
          available: true,
        })),
      })),
    })),
    plans: [],
    cast: {
      voice: { ja: null, en: null },
      proactive: false,
      instructions: {
        ja: "明るく麺量とトッピングを順に確認する。マシマシは量を説明し、未確認のアレルゲンを断定しない。",
        en: "Warmly confirm noodle portions and toppings in order. Explain double-extra portions and never assume allergen safety.",
      },
    },
  });
  draft = toolData(
    await client.callTool({
      name: "update_draft",
      arguments: { draftId: draft.id, expectedVersion: draft.version, configuration },
    }),
    configDraftSchema,
  );
  const ready = toolData(
    await client.callTool({
      name: "validate_draft",
      arguments: { draftId: draft.id, expectedVersion: draft.version },
    }),
    configDraftSchema,
  );
  expect(ready.status).toBe("ready");
  expect(ready.errors).toEqual([]);
  expect(ready.configuration).toEqual(configuration);
  const diff = toolData(
    await client.callTool({ name: "get_draft_diff", arguments: { draftId: draft.id } }),
    configDraftSchema,
  );
  expect(diff.changes).toContainEqual({
    path: "storeName",
    before: published.storeName,
    after: configuration.storeName,
    sensitive: false,
  });
  expect(
    toolData(await client.callTool({ name: "get_configuration", arguments: {} }), catalogSchema),
  ).toEqual(published);
  const cart = priceCart(
    ready.configuration,
    [
      {
        id: "tablecast-ramen-line",
        productId: "ramen",
        quantity: 1,
        selections: ["noodles", "vegetables", "garlic", "fat", "sauce"].map((group) => ({
          optionId: `${group}-mashimashi`,
          quantity: 1,
        })),
      },
    ],
    1,
  );
  expect(cart.complete).toBe(true);
  expect(cart.total).toBe(1200);
  expect(provider).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(ready)).not.toContain("tablecast-test-signature");

  // 店名も画像も、人の管理sessionによる公開までは現行店舗へ反映しない。
  const response = await post(
    `/api/admin/stores/tablecast-store/drafts/${draft.id}/publish`,
    {
      expectedVersion: draft.version,
      baseVersion: draft.baseVersion,
      idempotencyKey: "tablecast-ramen-name-publication",
      approved: true,
    },
    { Cookie: cookie },
  );
  expect(response.status).toBe(200);
  const current = toolData(
    await client.callTool({ name: "get_configuration", arguments: {} }),
    catalogSchema,
  );
  expect(current.storeName).toBe("麺屋 マシの頂");
  expect(current.configuration).toEqual(configuration);
});

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
  const uploaded = toolData(
    await client.callTool({
      name: "upload_image",
      arguments: {
        mimeType: "image/png",
        data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
        imageKind: "illustration",
        imageSource: { generated: true, description: "店舗から依頼されたお茶の生成イメージ" },
      },
    }),
    uploadedImageSchema,
  );
  const configuration = configurationSchema.parse({
    ...published.configuration,
    products: published.configuration.products.map((product) =>
      product.id === "tea"
        ? {
            ...product,
            price: 450,
            imageKey: uploaded.imageKey,
            imageKind: uploaded.imageKind,
            imageSource: uploaded.imageSource,
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
  const option = configuration.products.find((product) => product.id === "coffee")?.modifiers[0]
    ?.options[0];
  if (!option) throw new Error("選択肢fixtureがありません");
  option.imageKey = "tablecast/images/tablecast-milk.webp";
  option.imageKind = "photograph";
  option.text.ja.description = "白いミルクをグラスに注いだ参考写真です。";
  option.text.en.description = "A reference photograph of white milk in a glass.";
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
  expect(invalid.errors).toContainEqual({
    code: "PRODUCT_NOT_FOUND",
    path: ["plans", 0, "productIds", 0],
    params: { productId: "tablecast-missing-product" },
  });
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
  expect(difference.changes).toContainEqual(
    expect.objectContaining({
      path: "products.1.modifiers.0.options.0.imageKey",
      before: null,
      after: option.imageKey,
      sensitive: false,
    }),
  );
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
  const image = await exports.default.fetch(new Request(uploaded.url));
  expect(image.status).toBe(200);
  expect(image.headers.get("Content-Type")).toBe("image/webp");
  expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(0);
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

it("MCPとGUIの下書き検証が同じ音声・商品規則を使い、公開直前にも標準音声を照合する", async () => {
  const { cookie } = await setupFixture();
  const { token } = await authorise(cookie);
  const configured = env;
  const client = await connect(token, "tablecast-store", configured);
  let draft = toolData(
    await client.callTool({ name: "create_draft", arguments: {} }),
    configDraftSchema,
  );
  const configuration = structuredClone(draft.configuration);
  const product = configuration.products[0];
  if (!product) throw new Error("商品fixtureがありません");
  product.categoryId = "tablecast-missing-category";
  configuration.cast.voice.ja = "tablecast-new-ja";
  draft = toolData(
    await client.callTool({
      name: "update_draft",
      arguments: { draftId: draft.id, expectedVersion: draft.version, configuration },
    }),
    configDraftSchema,
  );

  const mcp = toolData(
    await client.callTool({
      name: "validate_draft",
      arguments: { draftId: draft.id, expectedVersion: draft.version },
    }),
    configDraftSchema,
  );
  const gui = await app.request(
    `/api/admin/stores/tablecast-store/drafts/${draft.id}/validate`,
    {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ expectedVersion: draft.version }),
    },
    configured,
  );
  expect(gui.status).toBe(200);
  expect(configDraftSchema.parse(await gui.json()).errors).toEqual(mcp.errors);
  expect(mcp.errors).toEqual([
    {
      code: "CATEGORY_NOT_FOUND",
      path: ["products", 0, "categoryId"],
      params: { categoryId: "tablecast-missing-category" },
    },
    {
      code: "VOICE_NOT_FOUND",
      path: ["cast", "voice", "ja"],
      params: { voiceId: "tablecast-new-ja" },
    },
  ]);
  product.categoryId = "drinks";
  configuration.cast.voice.ja = "marin";
  draft = toolData(
    await client.callTool({
      name: "update_draft",
      arguments: { draftId: draft.id, expectedVersion: draft.version, configuration },
    }),
    configDraftSchema,
  );
  const ready = toolData(
    await client.callTool({
      name: "validate_draft",
      arguments: { draftId: draft.id, expectedVersion: draft.version },
    }),
    configDraftSchema,
  );
  expect(ready.status).toBe("ready");
  const publication = await app.request(
    `/api/admin/stores/tablecast-store/drafts/${draft.id}/publish`,
    {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedVersion: draft.version,
        baseVersion: draft.baseVersion,
        idempotencyKey: "tablecast-mcp-voice-publication",
        approved: true,
      }),
    },
    configured,
  );
  expect(publication.status).toBe(200);
  expect((await client.listTools()).tools.map((tool) => tool.name)).not.toContain("publish_draft");
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

it("MCPは有限条件schemaを公開し、条件を往復保存して旧形式による消失を拒否する", async () => {
  const { cookie } = await setupFixture();
  const { token } = await authorise(cookie);
  const client = await connect(token);
  const descriptor = (await client.listTools()).tools.find((item) => item.name === "update_draft");
  expect(JSON.stringify(descriptor?.inputSchema)).toContain("tablecastConditionDepth8");
  expect(JSON.stringify(descriptor?.inputSchema).length).toBeLessThan(30000);
  let draft = toolData(
    await client.callTool({ name: "create_draft", arguments: {} }),
    configDraftSchema,
  );
  const configuration = structuredClone(draft.configuration);
  const owner = configuration.products[1]?.modifiers[0]?.options[0];
  if (!owner) throw new Error("条件fixtureがありません");
  owner.conditions = {
    version: 2,
    requires: { kind: "not", child: { kind: "option", optionId: "oat" } },
    excludes: null,
  };
  draft = toolData(
    await client.callTool({
      name: "update_draft",
      arguments: { draftId: draft.id, expectedVersion: draft.version, configuration },
    }),
    configDraftSchema,
  );
  expect(draft.configuration.products[1]?.modifiers[0]?.options[0]?.conditions).toEqual(
    owner.conditions,
  );
  const ready = toolData(
    await client.callTool({
      name: "validate_draft",
      arguments: { draftId: draft.id, expectedVersion: draft.version },
    }),
    configDraftSchema,
  );
  expect(ready.errors).toEqual([]);
  delete owner.conditions;
  toolError(
    await client.callTool({
      name: "update_draft",
      arguments: { draftId: draft.id, expectedVersion: draft.version, configuration },
    }),
    "CONFIGURATION_FORMAT_UNSUPPORTED",
  );
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
