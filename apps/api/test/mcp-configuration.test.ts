import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { afterEach, expect, it, onTestFinished, vi } from "vitest";
import { z } from "zod";
import app from "../src/app";
import { resolveLocalized } from "../src/modules/catalog/localization";
import {
  catalogSchema,
  configDraftSchema,
  configurationSchema,
  uploadedImageSchema,
} from "../src/schema";
import { setupFixture, text } from "./fixture";
import { authorise, connect, origin, post, toolData, toolError } from "./mcp-configuration-fixture";

afterEach(() => vi.restoreAllMocks());

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
    languages: ["ja", "en", "fr", "zh-Hans", "ko"],
    products: published.configuration.products.map((product) =>
      product.id === "tea"
        ? {
            ...product,
            price: 450,
            imageKey: uploaded.imageKey,
            imageKind: uploaded.imageKind,
            imageSource: uploaded.imageSource,
            text: {
              ...product.text,
              fr: { displayName: "Thé vert grillé", transliteration: "Hōjicha" },
              ja: {
                ...product.text.ja,
                displayName: "焙じ茶",
                speechName: "ほうじちゃ",
                transliteration: "ほうじちゃ",
              },
              en: {
                ...resolveLocalized(product.text, "en"),
                displayName: "Roasted tea",
                speechName: "Roasted tea",
                transliteration: "Roasted tea",
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
      systemInstructions: {
        ja: "標準の役割を保ち、回答は2文までにする。",
        en: "Keep the standard role and answer in up to 2 sentences.",
      },
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
  resolveLocalized(option.text, "en").description =
    "A reference photograph of white milk in a glass.";
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
  expect(
    difference.changes.some((change) => change.path.startsWith("cast.systemInstructions")),
  ).toBe(true);
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
  const image = await exports.default.fetch(
    new Request(uploaded.url, { headers: { Cookie: cookie } }),
  );
  expect(image.status).toBe(200);
  expect(image.headers.get("Content-Type")).toBe("image/webp");
  expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(0);
});

it("MCPとGUIの下書き検証が同じ音声・商品規則を使い、公開直前にも標準音声を照合する", async () => {
  const { cookie } = await setupFixture();
  const { token } = await authorise(cookie);
  const configured = env;
  const context = createExecutionContext();
  onTestFinished(() => waitOnExecutionContext(context));
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
    context,
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
    context,
  );
  expect(publication.status).toBe(200);
  expect((await client.listTools()).tools.map((tool) => tool.name)).not.toContain("publish_draft");
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
