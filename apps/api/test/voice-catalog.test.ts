import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { voiceToolNameSchema } from "../src/modules/voice/model";
import type { Product } from "../src/schema";
import * as business from "../src/db/business-schema";
import { configurationSchema } from "../src/modules/configuration/model";
import { getTableState } from "../src/modules/tables/queries";
import { invokeVoiceTool } from "../src/modules/voice/realtime";
import { createApiServices } from "../src/platform/context";
import { configuration, text as configurationText, device, setupVoiceFixture } from "./fixture";

afterEach(() => vi.restoreAllMocks());

const voiceId = "tablecast-tool-voice";

const services = () => createApiServices(env);

const setup = () => setupVoiceFixture(voiceId, "tablecast-turn");

const tool = (
  toolName: z.infer<typeof voiceToolNameSchema>,
  args: Record<string, unknown> = {},
  callId = crypto.randomUUID(),
) =>
  invokeVoiceTool(
    services(),
    {
      voiceSessionId: voiceId,
      turnId: "tablecast-turn",
      toolCallId: callId,
      toolName,
      arguments: args,
    },
    new AbortController().signal,
  );
describe("Responses functionと共通業務の認可", () => {
  it("かな・誤字・説明文の共通検索で最新の価格と版を返し、曖昧な候補は概要のカードとして表示する", async () => {
    await setup();
    const next = structuredClone(configuration);
    const tea = next.products[0];
    if (!tea) throw new Error("検索対象の商品がありません");
    tea.price = 920;
    tea.text.ja = {
      displayName: "唐揚げ",
      speechName: "からあげ",
      aliases: [],
      description: "柚子を添えた温かい料理",
    };
    await services()
      .db.update(business.stores)
      .set({ config_version: 4, config_json: JSON.stringify(next) })
      .where(eq(business.stores.id, device.storeId));
    expect((await tool("getCatalog", { query: "ｶﾗｱｹﾞ" })).result).toMatchObject({
      total: 1,
      version: 4,
      detail: true,
      products: [{ id: "tea", price: 920, foodInfo: tea.foodInfo }],
    });
    for (const query of ["からあけ", "柚子"])
      expect((await tool("getCatalog", { query, show: true })).result).toMatchObject({
        total: 1,
        version: 4,
        detail: false,
        displayedProductIds: ["tea"],
        products: [{ id: "tea", price: 920 }],
      });
    const events = (await getTableState(services(), device)).events.filter(
      (event) => event.kind === "voice.products",
    );
    expect(events.at(-1)?.data).toMatchObject({ productIds: ["tea"] });
    const overview = (await tool("getCatalog", { query: "柚子" })).result;
    expect(overview).not.toHaveProperty("products.0.foodInfo");
    expect(overview).not.toHaveProperty("products.0.modifiers");
  });
});
describe("Responses functionと共通業務の認可", () => {
  it.each(["アイス烏龍茶", "冷たいうーろん茶", "ウーロンティーを一つ"])(
    "登録名や別名を含む%sから必須選択肢付きの商品詳細を一回で取得する",
    async (query) => {
      await setup();
      const products = configuration.products.map((product) => ({
        ...product,
        text: {
          ...product.text,
          ja:
            product.id === "tea"
              ? {
                  ...product.text.ja,
                  displayName: "烏龍茶",
                  speechName: "うーろん茶",
                  aliases: ["ウーロンティー", ""],
                }
              : { ...product.text.ja, aliases: ["", " "] },
        },
        ...(product.id === "tea"
          ? {
              modifiers: [
                {
                  id: "temperature",
                  text: configurationText("温度", "Temperature"),
                  kind: "single",
                  min: 1,
                  max: 1,
                  options: [
                    {
                      id: "ice",
                      text: configurationText("アイス", "Iced"),
                      priceDelta: 0,
                      available: true,
                    },
                  ],
                },
              ],
            }
          : {}),
      }));
      await services()
        .db.update(business.stores)
        .set({ config_json: JSON.stringify({ ...configuration, products }) })
        .where(eq(business.stores.id, device.storeId));

      const result = await tool("getCatalog", { query });
      expect(result.result).toMatchObject({
        detail: true,
        products: [
          {
            id: "tea",
            foodInfo: configuration.products[0]?.foodInfo,
            modifiers: [{ id: "temperature", min: 1, options: [{ id: "ice" }] }],
          },
        ],
      });
      expect(result.result).toHaveProperty("products.length", 1);
    },
  );
});
describe("Responses functionと共通業務の認可", () => {
  it("無指定は一覧、未登録名は空の結果を返し、商品IDとカテゴリIDの検索を維持する", async () => {
    await setup();
    for (const args of [{}]) {
      const result = await tool("getCatalog", args);
      expect(result.result).toMatchObject({ detail: false });
      expect(result.result).toHaveProperty("products.length", 2);
      expect(result.result).not.toHaveProperty("products.0.foodInfo");
      expect(result.result).not.toHaveProperty("products.1.modifiers");
    }
    expect((await tool("getCatalog", { query: "未登録の商品", show: true })).result).toMatchObject({
      total: 0,
      more: false,
      products: [],
      displayedProductIds: [],
    });
    expect((await tool("getCatalog", { query: "tea" })).result).toMatchObject({
      detail: true,
      products: [{ id: "tea" }],
    });
    const category = await tool("getCatalog", { query: "drinks" });
    expect(category.result).toMatchObject({ detail: false });
    expect(category.result).toHaveProperty("products.length", 2);
  });
});
describe("Responses functionと共通業務の認可", () => {
  it("日英のカテゴリ名・読み・別名から概要を取得し、選んだ商品IDで必須選択を確認する", async () => {
    await setup();
    const sake: Product["text"] = configurationText("日本酒", "Rice wine");
    sake.ja.speechName = "にほんしゅ";
    sake.ja.aliases.push("清酒");
    sake.en.speechName = "Sah keh";
    sake.en.aliases.push("Japanese alcoholic drink");
    const sashimi = configurationText("刺身", "Raw fish");
    sashimi.ja.speechName = "さしみ";
    const products = configuration.products.map((product) => ({
      ...product,
      categoryId: product.id === "tea" ? "sashimi" : "sake",
    }));
    await services()
      .db.update(business.stores)
      .set({
        config_json: JSON.stringify({
          ...configuration,
          categories: [
            { id: "sake", text: sake },
            { id: "sashimi", text: sashimi },
          ],
          products,
        }),
      })
      .where(eq(business.stores.id, device.storeId));
    for (const query of [
      "日本酒",
      "にほんしゅ",
      "清酒",
      "Rice wine",
      "Sah keh",
      "Japanese alcoholic drink",
    ])
      expect((await tool("getCatalog", { query })).result).toMatchObject({
        detail: false,
        products: [
          {
            id: "coffee",
            categoryId: "sake",
            speechName: configuration.products[1]?.text.ja.speechName,
          },
        ],
      });
    for (const query of ["刺身", "さしみ", "Raw fish"])
      expect((await tool("getCatalog", { query })).result).toMatchObject({
        detail: false,
        products: [{ id: "tea", categoryId: "sashimi" }],
      });
    const combined = (await tool("getCatalog", { query: "刺身 日本酒" })).result;
    expect(combined).toMatchObject({ detail: false, products: [{ id: "tea" }, { id: "coffee" }] });
    expect(combined).not.toHaveProperty("products.1.modifiers");
    expect(combined).not.toHaveProperty("products.1.foodInfo");
    expect((await tool("getCatalog", { query: "coffee" })).result).toMatchObject({
      detail: true,
      products: [
        {
          id: "coffee",
          foodInfo: configuration.products[1]?.foodInfo,
          modifiers: [{ min: 1, options: [{ priceDelta: 0 }, { priceDelta: 100 }] }],
        },
      ],
    });
  });
});
describe("Responses functionと共通業務の認可", () => {
  it("正式銘柄名・ID・読み・別名の一致を共通語より優先し、複数商品の部分検索は維持する", async () => {
    await setup();
    const base = configuration.products[0];
    if (!base) throw new Error("検索対象の商品がありません");
    const tsukinagi: Product["text"] = configurationText(
      "こもれび 月凪 純米吟醸",
      "Komorebi Tsukinagi Junmai ginjo",
    );
    tsukinagi.ja.speechName = "こもれび つきなぎ 純米吟醸";
    tsukinagi.ja.aliases.push("つきなぎ");
    tsukinagi.en.aliases.push("Tsukinagi");
    const yukiakari = configurationText("こもれび 雪灯 純米酒", "Komorebi Yukiakari Junmai");
    const products = [
      { ...base, id: "sake-tsukinagi", text: tsukinagi, price: 620 },
      { ...base, id: "sake-yukiakari", text: yukiakari, price: 540 },
      {
        ...base,
        id: "sashimi",
        text: configurationText("お造り三種盛り", "Three-fish sashimi selection"),
        price: 1280,
      },
    ];
    await services()
      .db.update(business.stores)
      .set({ config_json: JSON.stringify({ ...configuration, products }) })
      .where(eq(business.stores.id, device.storeId));
    for (const query of [
      "こもれび 月凪 純米吟醸",
      "Komorebi Tsukinagi Junmai ginjo",
      "こもれび つきなぎ 純米吟醸",
      "つきなぎ",
      "Tsukinagi",
      " SAKE-TSUKINAGI ",
    ])
      expect((await tool("getCatalog", { query })).result).toMatchObject({
        detail: true,
        products: [{ id: "sake-tsukinagi", price: 620, foodInfo: base.foodInfo }],
      });
    expect((await tool("getCatalog", { query: "こもれび 雪灯 純米酒" })).result).toMatchObject({
      detail: true,
      products: [{ id: "sake-yukiakari", price: 540 }],
    });
    expect((await tool("getCatalog", { query: "月凪 雪灯" })).result).toMatchObject({
      detail: false,
      products: [{ id: "sake-tsukinagi" }, { id: "sake-yukiakari" }],
    });
    const missing = (await tool("getCatalog", { query: "未登録の銘柄" })).result;
    expect(missing).toMatchObject({ detail: false });
    expect(missing).toHaveProperty("products.length", 0);
    expect(missing).not.toHaveProperty("products.0.foodInfo");
  });
});
describe("Responses functionと共通業務の認可", () => {
  it("多数のカテゴリ商品を省略せず概要で返し、個別詳細の取得では最新価格と必須選択を保つ", async () => {
    await setup();
    const base = configuration.products[1];
    if (!base) throw new Error("検索対象の商品がありません");
    const products = Array.from({ length: 28 }, (_, index) => ({
      ...base,
      id: `sake-${index}`,
      categoryId: "sake",
      text: {
        ja: {
          ...base.text.ja,
          displayName: `日本酒銘柄${index}`,
          speechName: `にほんしゅめいがら${index}`,
          description: "辛口。表示価格は60mlです。",
          aliases: [`別名${index}`],
        },
        en: {
          ...base.text.en,
          displayName: `Sake ${index}`,
          speechName: `Sake ${index}`,
          description: "Dry. The displayed price is for 60ml.",
          aliases: [`Alias ${index}`],
        },
      },
      available: index !== 27,
      tags: ["popular"],
    }));
    const menu = {
      ...configuration,
      categories: [{ id: "sake", text: configurationText("日本酒", "Sake") }],
      products,
    };
    await services()
      .db.update(business.stores)
      .set({ config_json: JSON.stringify(menu) })
      .where(eq(business.stores.id, device.storeId));
    const overview = (await tool("getCatalog", { query: "日本酒" })).result;
    expect(overview).toMatchObject({ detail: false });
    expect(overview).toHaveProperty("products.length", 8);
    expect(overview).toMatchObject({ total: 28, more: true });
    const lastPage = (await tool("getCatalog", { query: "日本酒", offset: 24 })).result;
    expect(lastPage).toMatchObject({ total: 28, more: false });
    expect(lastPage).toHaveProperty("products.3.available", false);
    expect(overview).toHaveProperty("products.0.speechName", "にほんしゅめいがら0");
    expect(overview).toHaveProperty("products.0.description", "辛口。表示価格は60mlです。");
    for (const field of ["aliases", "tags", "foodInfo", "modifiers"])
      expect(overview).not.toHaveProperty(`products.0.${field}`);
    const selected = (await tool("getCatalog", { query: "sake-0" })).result;
    expect(selected).toMatchObject({
      detail: true,
      products: [
        {
          id: "sake-0",
          price: base.price,
          foodInfo: base.foodInfo,
          modifiers: [{ min: 1, max: 1, options: [{ priceDelta: 0 }, { priceDelta: 100 }] }],
        },
      ],
    });
    await services()
      .db.update(business.stores)
      .set({
        config_json: JSON.stringify({
          ...menu,
          products: products.map((product) =>
            product.id === "sake-0" ? { ...product, price: 650 } : product,
          ),
        }),
      })
      .where(eq(business.stores.id, device.storeId));
    expect((await tool("getCatalog", { query: "別名0" })).result).toMatchObject({
      detail: true,
      products: [{ id: "sake-0", price: 650, foodInfo: base.foodInfo }],
    });
  });
});
describe("Responses functionと共通業務の認可", () => {
  it("有効な2000商品の代表ページ境界と終端で価格・出力上限を守り、個別詳細の必須選択を保つ", async () => {
    await setup();
    const base = configuration.products[1];
    if (!base) throw new Error("商品fixtureがありません");
    const products = Array.from({ length: 2000 }, (_, index) => ({
      ...base,
      id: `tablecast-paged-${index}`,
      price: 100 + index,
    }));
    const expanded = configurationSchema.parse({ ...configuration, products });
    await services()
      .db.update(business.stores)
      .set({ config_json: JSON.stringify(expanded) })
      .where(eq(business.stores.id, device.storeId));
    const pageSchema = z.object({
      total: z.number(),
      more: z.boolean(),
      version: z.number(),
      detail: z.boolean(),
      products: z.array(z.object({ id: z.string(), price: z.number() })),
    });
    const pages = [
      { offset: 0, indices: [0, 1, 2, 3, 4, 5, 6, 7], more: true },
      { offset: 8, indices: [8, 9, 10, 11, 12, 13, 14, 15], more: true },
      { offset: 1000, indices: [1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007], more: true },
      { offset: 1008, indices: [1008, 1009, 1010, 1011, 1012, 1013, 1014, 1015], more: true },
      { offset: 1992, indices: [1992, 1993, 1994, 1995, 1996, 1997, 1998, 1999], more: false },
      { offset: 1999, indices: [1999], more: false },
      { offset: 2000, indices: [], more: false },
    ];
    for (const { offset, indices, more } of pages) {
      const result = await tool("getCatalog", { offset, limit: 8 });
      const page = pageSchema.parse(result.result);
      expect(page).toEqual({
        total: 2000,
        more,
        version: 1,
        detail: false,
        products: indices.map((index) => ({ id: `tablecast-paged-${index}`, price: 100 + index })),
      });
      expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThan(6000);
    }
    const selected = await tool("getCatalog", { query: "tablecast-paged-1999" });
    expect(selected.result).toMatchObject({
      total: 1,
      more: false,
      detail: true,
      version: 1,
      products: [
        {
          id: "tablecast-paged-1999",
          price: 2099,
          foodInfo: base.foodInfo,
          modifiers: [
            {
              min: 1,
              options: [
                { id: "dairy", priceDelta: 0 },
                { id: "oat", priceDelta: 100 },
              ],
            },
          ],
        },
      ],
    });
    expect(new TextEncoder().encode(JSON.stringify(selected)).byteLength).toBeLessThan(6000);
    for (const offset of [-1, 2001, 1.5])
      await expect(tool("getCatalog", { offset })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(tool("getCatalog", { offset: 1008, limit: 9 })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });
});

it("選択後の食事制限を読取り専用の音声ツールで確認し、注文かごを変えない", async () => {
  await setup();
  const response = await tool("getProductFoodInformation", {
    productId: "coffee",
    selections: [{ optionId: "dairy", quantity: 1 }],
  });
  expect(response.result).toMatchObject({
    configVersion: 1,
    productId: "coffee",
    complete: true,
    foodInformation: {
      allergens: {},
      crossContact: "unknown",
      dietary: {
        vegan: { status: "unknown" },
        vegetarian: { status: "unknown" },
        halal: { status: "unknown" },
        glutenFree: { status: "unknown" },
      },
    },
  });
  expect((await getTableState(services(), device)).cart.lines).toHaveLength(0);
});
