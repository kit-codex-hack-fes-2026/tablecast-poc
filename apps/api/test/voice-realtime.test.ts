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
