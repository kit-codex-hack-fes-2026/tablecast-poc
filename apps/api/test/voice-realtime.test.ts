import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as business from "../src/db/business-schema";
import { conversationHistory, invokeVoiceTool } from "../src/modules/voice/realtime";
import { recordConversationItems } from "../src/modules/voice/conversation";
import { setVoiceSession } from "../src/modules/voice/service";
import { getTableState } from "../src/modules/tables/queries";
import { createApiServices } from "../src/platform/context";
import type { voiceToolNameSchema } from "../src/modules/voice/model";
import type { z } from "zod";
import type { Product } from "../src/schema";
import { configuration, device, setupFixture, text as configurationText } from "./fixture";

afterEach(() => vi.restoreAllMocks());
const voiceId = "tablecast-tool-voice";
const services = () => createApiServices(env);
async function setup() {
  await setupFixture();
  await setVoiceSession(services(), device, voiceId);
  await services().db.batch([
    services()
      .db.insert(business.voiceTurns)
      .values({
        id: "tablecast-turn",
        voice_session_id: voiceId,
        table_session_id: device.tableSessionId ?? "",
        store_id: device.storeId,
        status: "started",
        started_at: Date.now(),
        locale: "ja",
      }),
    services()
      .db.update(business.tableSessions)
      .set({ active_turn_id: "tablecast-turn" })
      .where(eq(business.tableSessions.id, device.tableSessionId ?? "")),
  ]);
}
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

describe("Agents functionと共通業務の認可", () => {
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
            allergens: configuration.products[0]?.allergens,
            modifiers: [{ id: "temperature", min: 1, options: [{ id: "ice" }] }],
          },
        ],
      });
      expect(result.result).toHaveProperty("products.length", 1);
    },
  );
  it("無指定と未登録名は一覧を返し、商品IDとカテゴリIDの検索を維持する", async () => {
    await setup();
    for (const args of [{}, { query: "未登録の商品" }]) {
      const result = await tool("getCatalog", args);
      expect(result.result).toMatchObject({ detail: false });
      expect(result.result).toHaveProperty("products.length", 2);
      expect(result.result).not.toHaveProperty("products.0.allergens");
      expect(result.result).not.toHaveProperty("products.1.modifiers");
    }
    expect((await tool("getCatalog", { query: "tea" })).result).toMatchObject({
      detail: true,
      products: [{ id: "tea" }],
    });
    const category = await tool("getCatalog", { query: "drinks" });
    expect(category.result).toMatchObject({ detail: true });
    expect(category.result).toHaveProperty("products.length", 2);
  });
  it("日英のカテゴリ名・読み・別名から、そのカテゴリだけの詳細を取得する", async () => {
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
        detail: true,
        products: [
          {
            id: "coffee",
            categoryId: "sake",
            allergens: configuration.products[1]?.allergens,
            modifiers: [{ min: 1, options: [{ priceDelta: 0 }, { priceDelta: 100 }] }],
          },
        ],
      });
    for (const query of ["刺身", "さしみ", "Raw fish"])
      expect((await tool("getCatalog", { query })).result).toMatchObject({
        detail: true,
        products: [
          { id: "tea", categoryId: "sashimi", allergens: configuration.products[0]?.allergens },
        ],
      });
  });
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
        products: [{ id: "sake-tsukinagi", price: 620, allergens: base.allergens }],
      });
    expect((await tool("getCatalog", { query: "こもれび 雪灯 純米酒" })).result).toMatchObject({
      detail: true,
      products: [{ id: "sake-yukiakari", price: 540 }],
    });
    expect((await tool("getCatalog", { query: "月凪 雪灯" })).result).toMatchObject({
      detail: true,
      products: [{ id: "sake-tsukinagi" }, { id: "sake-yukiakari" }],
    });
    const missing = (await tool("getCatalog", { query: "未登録の銘柄" })).result;
    expect(missing).toMatchObject({ detail: false });
    expect(missing).toHaveProperty("products.length", 3);
    expect(missing).not.toHaveProperty("products.0.allergens");
  });
  it("JSON Schema違反と停止後の操作を拒否する", async () => {
    await setup();
    await expect(tool("setSpeechSpeed", { speed: 1.6 })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await setVoiceSession(services(), device, null);
    await expect(tool("callStaff")).rejects.toMatchObject({ code: "VOICE_SESSION_STALE" });
    expect((await getTableState(services(), device)).staffCalled).toBe(false);
  });
  it("同じcall IDの同時実行を一回だけ許可する", async () => {
    await setup();
    const results = await Promise.allSettled([
      tool("setSpeechSpeed", { speed: 1.2 }, "tablecast-same-call"),
      tool("setSpeechSpeed", { speed: 1.2 }, "tablecast-same-call"),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const state = await getTableState(services(), device);
    expect(state.speechSpeed).toBe(1.2);
    expect(state.events.filter((event) => event.kind === "voice.speed")).toHaveLength(1);
  });
  it("次の発話が開始したら古い業務呼出しを拒否する", async () => {
    await setup();
    await services()
      .db.update(business.tableSessions)
      .set({ active_turn_id: "tablecast-new-turn" })
      .where(eq(business.tableSessions.id, device.tableSessionId ?? ""));
    await expect(tool("callStaff")).rejects.toMatchObject({ code: "VOICE_SESSION_STALE" });
    expect((await getTableState(services(), device)).staffCalled).toBe(false);
  });
  it("自発接客の呼出しには読取専用toolだけを許可する", async () => {
    await setup();
    await services().db.batch([
      services()
        .db.update(business.stores)
        .set({
          config_json: JSON.stringify({
            ...configuration,
            cast: { ...configuration.cast, proactive: true },
          }),
        })
        .where(eq(business.stores.id, device.storeId)),
      services()
        .db.insert(business.tableEvents)
        .values({
          store_id: device.storeId,
          table_session_id: device.tableSessionId,
          kind: "voice.proactive",
          data_json: JSON.stringify({ turnId: "tablecast-turn" }),
          created_at: Date.now(),
        }),
    ]);
    await expect(tool("getCatalog")).resolves.toHaveProperty("result.products");
    await expect(tool("callStaff")).rejects.toMatchObject({ code: "VOICE_TOOL_FORBIDDEN" });
    const state = await getTableState(services(), device);
    expect(state.staffCalled).toBe(false);
    expect(
      state.events
        .filter((event) => event.kind === "voice.tool" && event.data.toolName === "callStaff")
        .at(-1)?.data,
    ).toMatchObject({ state: "error", errorCode: "VOICE_TOOL_FORBIDDEN" });
  });
});

describe("字幕履歴の保存と参照", () => {
  it("委任のない会話も重複せず保存し、別の来店に渡さない", async () => {
    await setup();
    const item = {
      voiceSessionId: voiceId,
      itemId: "tablecast-greeting",
      role: "user" as const,
      text: "こんにちは",
      interrupted: false,
    };
    await recordConversationItems(services(), device, { voiceSessionId: voiceId, items: [item] });
    await recordConversationItems(services(), device, { voiceSessionId: voiceId, items: [item] });
    expect(await conversationHistory(services(), device)).toEqual([
      { role: "user", content: "こんにちは", interrupted: false },
    ]);
    expect(
      await conversationHistory(services(), { ...device, tableSessionId: "tablecast-other-table" }),
    ).toEqual([]);
    await setVoiceSession(services(), device, null);
    await expect(
      recordConversationItems(services(), device, { voiceSessionId: voiceId, items: [item] }),
    ).rejects.toMatchObject({
      code: "VOICE_SESSION_STALE",
    });
  });
  it("新しい会話を優先して履歴の文字数を制限する", async () => {
    await setup();
    for (const [index, text] of [
      "古い会話",
      "あ".repeat(9000),
      "い".repeat(9000),
      "直前の希望",
    ].entries())
      await recordConversationItems(services(), device, {
        voiceSessionId: voiceId,
        items: [
          {
            itemId: `tablecast-item-${index}`,
            role: "user",
            text,
            interrupted: false,
          },
        ],
      });
    expect((await conversationHistory(services(), device)).map((item) => item.content)).toEqual([
      "い".repeat(9000),
      "直前の希望",
    ]);
  });
});
