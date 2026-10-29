import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { env, exports } from "cloudflare:workers";
import { afterEach, expect, it, onTestFinished, vi } from "vitest";
import { z } from "zod";
import app from "../src/app";
import { createAuth } from "../src/modules/auth/service";
import { priceCart } from "../src/modules/catalog/pricing";
import {
  catalogSchema,
  configDraftSchema,
  configurationSchema,
  uploadedImageSchema,
} from "../src/schema";
import { setupFixture, text } from "./fixture";

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

it("MCPのテーマ制作を商品を保持した検証済み下書きへ保存し管理画面から同じ版を取得する", async () => {
  const { cookie } = await setupFixture();
  const { token } = await authorise(cookie);
  const client = await connect(token);
  const spec = toolData(
    await client.callTool({ name: "get_theme_spec", arguments: {} }),
    z.object({
      storeId: z.string(),
      schema: z.object({ properties: z.record(z.string(), z.unknown()) }),
      artwork: z.array(z.object({ role: z.string(), target: z.string() })),
      editorUrl: z.string(),
    }),
  );
  expect(spec.storeId).toBe("tablecast-store");
  expect(spec.schema.properties).toHaveProperty("appearance");
  expect(spec.artwork.map((item) => item.role)).toEqual([
    "background",
    "logo",
    "header-banner",
    "membership-card",
    "member-app-icon",
    "banner",
  ]);
  expect(new URL(spec.editorUrl).pathname).toBe("/admin/stores/tablecast-store/design");
  const published = toolData(
    await client.callTool({ name: "get_configuration", arguments: {} }),
    catalogSchema,
  );
  const image = toolData(
    await client.callTool({
      name: "upload_image",
      arguments: {
        data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
        mimeType: "image/png",
        imageKind: "illustration",
        imageSource: { generated: false, description: "提供された店舗ロゴ" },
      },
    }),
    uploadedImageSchema,
  );
  const { url: _url, ...reference } = image;
  const asset = { ...reference, alt: { ja: "店舗ロゴ", en: "Store logo" } };
  const product = published.configuration.products[0];
  if (!product) throw new Error("商品が必要です");
  let draft = toolData(
    await client.callTool({ name: "create_draft", arguments: {} }),
    configDraftSchema,
  );
  draft = toolData(
    await client.callTool({
      name: "update_draft",
      arguments: {
        draftId: draft.id,
        expectedVersion: draft.version,
        instructionFormatVersion: 1,
        configuration: {
          ...published.configuration,
          branding: { logo: asset },
          appearance: {
            composition: {
              masthead: {
                visible: true,
                align: "center",
                logoWidth: 280,
                logoHeight: 96,
                padding: 16,
              },
              banners: { columns: 2, gap: 16 },
            },
            colours: { ink: "#201a16", paper: "#fff8e7", accent: "#bb241c" },
            fonts: { heading: "serif", body: "sans" },
            assets: { paper: asset },
            parts: {
              screen: {
                image: { asset: "paper", fit: "repeat", x: 50, y: 50, opacity: 1, tileSize: 256 },
              },
            },
            customCss:
              '[data-theme-part="product-card"] { background-image:var(--tablecast-image-paper); border-width:3px; border-style:solid; }',
          },
          banners: [
            {
              id: "flyer",
              image: asset,
              enabled: true,
              hotspots: [
                { id: "first", productId: product.id, rect: { x: 0, y: 0, width: 1, height: 1 } },
              ],
            },
          ],
        },
      },
    }),
    configDraftSchema,
  );
  draft = toolData(
    await client.callTool({
      name: "validate_draft",
      arguments: { draftId: draft.id, expectedVersion: draft.version },
    }),
    configDraftSchema,
  );
  expect(draft.status).toBe("ready");
  expect(draft.configuration.products).toEqual(published.configuration.products);
  expect(draft.configuration.cast).toEqual(published.configuration.cast);
  const response = await exports.default.fetch(
    new Request(`${origin}/api/admin/stores/tablecast-store/drafts/${draft.id}`, {
      headers: { Cookie: cookie },
    }),
  );
  expect(response.status).toBe(200);
  const { imageAssets, ...httpDraft } = configDraftSchema.parse(await response.json());
  expect(httpDraft).toEqual(draft);
  expect(draft).not.toHaveProperty("imageAssets");
  expect(imageAssets?.[image.imageKey]).toMatchObject({ width: 1, height: 1 });
  expect(imageAssets?.[image.imageKey]?.blurhash).toHaveLength(52);
  expect(
    toolData(
      await client.callTool({ name: "get_draft_diff", arguments: { draftId: draft.id } }),
      configDraftSchema,
    ).configuration.branding?.logo,
  ).toEqual(asset);
  expect(
    toolData(
      await client.callTool({
        name: "request_publication",
        arguments: { draftId: draft.id, expectedVersion: draft.version },
      }),
      z.object({ status: z.string() }),
    ).status,
  ).toBe("human_approval_required");
  expect(
    toolData(await client.callTool({ name: "get_configuration", arguments: {} }), catalogSchema)
      .configuration,
  ).toEqual(published.configuration);
});

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
    languages: ["ja", "en"],
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
