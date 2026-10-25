import { env } from "cloudflare:workers";
import { afterEach, expect, it, vi } from "vitest";
import { getTableState } from "../src/modules/tables/queries";
import { recordConversationItems } from "../src/modules/voice/conversation";
import { invokeVoiceTool } from "../src/modules/voice/realtime";
import { setVoiceSession } from "../src/modules/voice/service";
import { createVoiceSuggestions } from "../src/modules/voice/use-cases/guidance";
import { createApiServices } from "../src/platform/context";
import { configurationSchema } from "../src/schema";
import { configuration, device, setupFixture } from "./fixture";
import { runVoiceTurn } from "./voice-fixture";

afterEach(() => vi.restoreAllMocks());
const source = {
  voiceSessionId: "tablecast-guidance-live",
  locale: "ja" as const,
  itemId: "tablecast-caption",
  text: "お茶はいかがですか？",
};
async function setup() {
  await setupFixture();
  const services = createApiServices({
    ...env,
    TABLECAST_VOICE_ENABLED: "true",
    TABLECAST_MODEL_API_KEY: "tablecast-test-key",
    TABLECAST_MODEL: "gpt-6-luna",
  });
  await setVoiceSession(services, device, source.voiceSessionId);
  await recordConversationItems(services, device, {
    voiceSessionId: source.voiceSessionId,
    items: [{ itemId: source.itemId, role: "assistant", text: source.text, interrupted: false }],
  });
  return services;
}
const modelResponse = () =>
  Response.json({
    id: "resp_tablecast_guidance",
    object: "response",
    status: "completed",
    output: [
      {
        type: "message",
        id: "msg_tablecast_guidance",
        role: "assistant",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              suggestions: [
                "お茶の種類を教えてください",
                "料理のおすすめはありますか？",
                "今は大丈夫です",
              ],
            }),
            annotations: [],
          },
        ],
      },
    ],
    usage: { input_tokens: 120, output_tokens: 30, total_tokens: 150 },
  });

it("旧設定を変更せず読み込み、日英の開始方針を保存できる", () => {
  expect(configurationSchema.parse(configuration).cast.openingInstructions).toBeUndefined();
  const value = {
    ...configuration,
    cast: {
      ...configuration.cast,
      openingInstructions: { ja: "お茶を案内する", en: "Offer tea." },
    },
  };
  expect(configurationSchema.parse(value).cast.openingInstructions).toEqual(
    value.cast.openingInstructions,
  );
});

it("同じ字幕の並行要求では一度だけ候補を生成し、予約で会話履歴を圧迫しない", async () => {
  const services = await setup();
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(modelResponse());
  const results = await Promise.all(
    [1, 2].map(() =>
      createVoiceSuggestions(services, device, source, new AbortController().signal),
    ),
  );
  expect(
    results.map((result) => result.suggestions.length).toSorted((left, right) => left - right),
  ).toEqual([0, 3]);
  expect(fetch).toHaveBeenCalledOnce();
  const state = await getTableState(services, device);
  expect(state.events.some((event) => event.kind === "voice.suggestions")).toBe(false);
  expect(state.orders).toHaveLength(0);
});

it("字幕・言語・停止済みsessionが異なる候補要求はモデルへ送らない", async () => {
  const services = await setup();
  const fetch = vi.spyOn(globalThis, "fetch");
  for (const input of [
    { ...source, text: "違う字幕" },
    { ...source, locale: "en" as const },
    { ...source, voiceSessionId: "tablecast-stopped-live" },
  ])
    await expect(
      createVoiceSuggestions(services, device, input, new AbortController().signal),
    ).rejects.toHaveProperty("code");
  expect(fetch).not.toHaveBeenCalled();
});

it("客の発話前の開始案内は参照専用で、注文操作を実行しない", async () => {
  const services = await setup();
  const turn = await runVoiceTurn({
    voiceSessionId: source.voiceSessionId,
    turnId: "tablecast-opening-turn",
    locale: "ja",
    trigger: "opening",
    messages: [],
  });
  await turn.finish();
  await expect(
    invokeVoiceTool(
      services,
      {
        voiceSessionId: source.voiceSessionId,
        turnId: "tablecast-opening-turn",
        toolName: "updateCart",
        toolCallId: "tablecast-opening-write",
        arguments: { expectedVersion: 0, lines: [] },
      },
      new AbortController().signal,
    ),
  ).rejects.toHaveProperty("code", "VOICE_TOOL_FORBIDDEN");
  expect((await getTableState(services, device)).cart.lines).toHaveLength(0);
});
