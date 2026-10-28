import type { z } from "zod";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { voiceToolNameSchema } from "../src/modules/voice/model";
import * as business from "../src/db/business-schema";
import { getTableState } from "../src/modules/tables/queries";
import { recordConversationItems } from "../src/modules/voice/conversation";
import { conversationHistory, invokeVoiceTool } from "../src/modules/voice/realtime";
import { setVoiceSession } from "../src/modules/voice/service";
import { createApiServices } from "../src/platform/context";
import { configuration, device, setupFixture } from "./fixture";

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
describe("Responses functionと共通業務の認可", () => {
  it("JSON Schema違反と停止後の操作を拒否する", async () => {
    await setup();
    await expect(tool("setSpeechSpeed", { speed: 1.6 })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await setVoiceSession(services(), device, null);
    await expect(tool("callStaff")).rejects.toMatchObject({ code: "VOICE_SESSION_STALE" });
    expect((await getTableState(services(), device)).staffCalled).toBe(false);
  });
});
describe("Responses functionと共通業務の認可", () => {
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
});
describe("Responses functionと共通業務の認可", () => {
  it("次の発話が開始したら古い業務呼出しを拒否する", async () => {
    await setup();
    await services()
      .db.update(business.tableSessions)
      .set({ active_turn_id: "tablecast-new-turn" })
      .where(eq(business.tableSessions.id, device.tableSessionId ?? ""));
    await expect(tool("callStaff")).rejects.toMatchObject({ code: "VOICE_SESSION_STALE" });
    expect((await getTableState(services(), device)).staffCalled).toBe(false);
  });
});
describe("Responses functionと共通業務の認可", () => {
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
});
describe("字幕履歴の保存と参照", () => {
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

it("音声toolはORとNOTを保って返し、参照先全件を必須にせず注文かごへ反映する", async () => {
  await setup();
  const updated = structuredClone(configuration);
  const owner = updated.products[1]?.modifiers[0]?.options[0];
  if (!owner) throw new Error("条件fixtureがありません");
  owner.conditions = {
    version: 2,
    requires: {
      kind: "or",
      children: [
        { kind: "option", optionId: "oat" },
        { kind: "not", child: { kind: "option", optionId: "oat" } },
      ],
    },
    excludes: null,
  };
  await services()
    .db.update(business.stores)
    .set({ config_json: JSON.stringify(updated) })
    .where(eq(business.stores.id, device.storeId));
  const catalog = await tool("getCatalog", { query: "coffee" });
  expect(JSON.stringify(catalog.result)).toContain(JSON.stringify(owner.conditions));
  const searches = (await getTableState(services(), device)).events.filter(
    (event) => event.kind === "voice.tool" && event.data.toolName === "getCatalog",
  );
  expect(searches).toHaveLength(2);
  expect(searches.every((event) => !("query" in event.data))).toBe(true);
  // 常に真のORでも参照を全件必須へ平坦化しない。
  const result = await tool("updateCart", {
    expectedVersion: 0,
    lines: [
      {
        id: "tablecast-condition-line",
        productId: "coffee",
        quantity: 1,
        selections: [{ optionId: owner.id, quantity: 1 }],
      },
    ],
  });
  expect(result.result).toMatchObject({ cart: { complete: true } });
});
