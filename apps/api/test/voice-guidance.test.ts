import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import app from "../src/app";
import * as business from "../src/db/business-schema";
import { getTableState } from "../src/modules/tables/queries";
import { recordConversationItems } from "../src/modules/voice/conversation";
import { createVoiceOpening, createVoiceSuggestions } from "../src/modules/voice/guidance";
import { setVoiceSession } from "../src/modules/voice/service";
import { createApiServices } from "../src/platform/context";
import { device, deviceToken, setupFixture } from "./fixture";

const configured = () => ({
  ...env,
  TABLECAST_VOICE_ENABLED: "true",
  TABLECAST_MODEL_API_KEY: "tablecast-private-model-key",
});
const sessionId = "tablecast-guidance-live";
const signal = () => new AbortController().signal;
const source = {
  voiceSessionId: sessionId,
  itemId: "tablecast-guidance-caption",
  text: "ご注文の仕方をご案内しましょうか？",
};
afterEach(() => vi.restoreAllMocks());

function modelResponse(value: unknown) {
  return Response.json({
    id: "resp_tablecast_guidance",
    object: "response",
    status: "completed",
    output: [
      {
        type: "message",
        id: "msg_tablecast_guidance",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: JSON.stringify(value), annotations: [] }],
      },
    ],
    usage: { input_tokens: 120, output_tokens: 30, total_tokens: 150 },
  });
}
async function saveAssistant(services: ReturnType<typeof createApiServices>, text = source.text) {
  await recordConversationItems(services, device, {
    voiceSessionId: sessionId,
    items: [{ itemId: source.itemId, role: "assistant", text, interrupted: false }],
  });
}

it("初回は接続時の設定で歓迎し、同じ接続の並行要求は一つだけ生成する", async () => {
  await setupFixture();
  const services = createApiServices(configured());
  await setVoiceSession(services, device, sessionId, undefined, undefined, {
    storeName: "卓上喫茶",
    instructions: "静かで丁寧な接客",
    openingInstructions: "ご注文方法を案内する",
  });
  const calls: unknown[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
    calls.push(JSON.parse(z.string().parse(options?.body)));
    return modelResponse({ text: "卓上喫茶へようこそ。ご注文方法をご案内しましょうか？" });
  });
  const results = await Promise.all([
    createVoiceOpening(services, device, sessionId, signal()),
    createVoiceOpening(services, device, sessionId, signal()),
  ]);
  expect(results.filter(Boolean)).toEqual([
    { mode: "welcome", locale: "ja", text: "卓上喫茶へようこそ。ご注文方法をご案内しましょうか？" },
  ]);
  expect(calls).toHaveLength(1);
  expect(JSON.stringify(calls[0])).toContain("ご注文方法を案内する");
  const state = await getTableState(services, device);
  expect(state.cart.lines).toEqual([]);
  expect(state.events.filter((event) => event.kind === "voice.opening")).toHaveLength(1);
  expect(state.events.some((event) => event.kind === "voice.user")).toBe(false);
});

it("同じ来店に会話があれば新しい接続は再開案内となる", async () => {
  await setupFixture();
  const services = createApiServices(configured());
  await setVoiceSession(services, device, "tablecast-previous-live");
  await recordConversationItems(services, device, {
    voiceSessionId: "tablecast-previous-live",
    items: [
      {
        itemId: "tablecast-previous-caption",
        role: "assistant",
        text: "いらっしゃいませ",
        interrupted: false,
      },
    ],
  });
  await setVoiceSession(services, device, sessionId);
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    modelResponse({ text: "引き続きご案内します。" }),
  );
  expect(await createVoiceOpening(services, device, sessionId, signal())).toMatchObject({
    mode: "resume",
  });
});

it.each(["submitOrder", "showProducts", "getCatalog"])(
  "開始案内の%s経由の書込みを実行前に拒否する",
  async (toolName) => {
    await setupFixture();
    const services = createApiServices(configured());
    await setVoiceSession(services, device, sessionId);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        status: "completed",
        output: [
          {
            type: "function_call",
            id: "fc_tablecast",
            call_id: "call_tablecast",
            name: toolName,
            arguments: JSON.stringify(toolName === "getCatalog" ? { show: true } : {}),
          },
        ],
      }),
    );
    await expect(createVoiceOpening(services, device, sessionId, signal())).rejects.toMatchObject({
      code: "VOICE_TOOL_FORBIDDEN",
    });
    const state = await getTableState(services, device);
    expect(state.cart.lines).toEqual([]);
    expect(state.orders).toEqual([]);
    expect(state.events.some((event) => event.kind === "voice.products")).toBe(false);
  },
);

it("開始案内は公開カタログを参照し、モデルには書込みツールを渡さない", async () => {
  await setupFixture();
  const services = createApiServices(configured());
  await setVoiceSession(services, device, sessionId);
  const bodies: unknown[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
    bodies.push(JSON.parse(z.string().parse(options?.body)));
    if (bodies.length === 1)
      return Response.json({
        status: "completed",
        output: [
          {
            type: "function_call",
            id: "fc_tablecast",
            call_id: "call_tablecast",
            name: "getCatalog",
            arguments: '{"query":"tea"}',
          },
        ],
      });
    return modelResponse({ text: "お茶はいかがでしょうか？" });
  });
  await createVoiceOpening(services, device, sessionId, signal());
  const first = z.object({ tools: z.array(z.object({ name: z.string() })) }).parse(bodies[0]);
  expect(first.tools.map((tool) => tool.name)).toEqual(["getCatalog"]);
  const second = z
    .object({
      input: z.array(z.object({ type: z.string().optional(), output: z.string().optional() })),
    })
    .parse(bodies[1]);
  const output = second.input.find((item) => item.type === "function_call_output")?.output;
  expect(JSON.parse(output ?? "{}")).toMatchObject({
    storeName: "卓上喫茶",
    products: [{ id: "tea", available: true }],
  });
});

it("最新の保存済みAI字幕だけから返答例を作り、本人情報や業務ツールを追加しない", async () => {
  await setupFixture();
  const services = createApiServices(configured());
  await setVoiceSession(services, device, sessionId);
  await saveAssistant(services);
  const provider = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      modelResponse({ suggestions: ["説明をお願いします", "少しメニューを見ます"] }),
    );
  expect(await createVoiceSuggestions(services, device, source, signal())).toMatchObject({
    itemId: source.itemId,
    text: source.text,
    suggestions: ["説明をお願いします", "少しメニューを見ます"],
  });
  const body: unknown = JSON.parse(z.string().parse(provider.mock.calls[0]?.[1]?.body));
  expect(body).not.toHaveProperty("tools");
});

it.each(["別卓", "停止", "本文不一致", "新しい客発話"])(
  "返答例は%sの対象をモデル呼出し前に拒否する",
  async (kind) => {
    await setupFixture();
    const services = createApiServices(configured());
    await setVoiceSession(services, device, sessionId);
    await saveAssistant(services);
    if (kind === "停止") await setVoiceSession(services, device, null);
    if (kind === "新しい客発話")
      await recordConversationItems(services, device, {
        voiceSessionId: sessionId,
        items: [
          {
            itemId: "tablecast-next-guest",
            role: "user",
            text: "もう大丈夫です",
            interrupted: false,
          },
        ],
      });
    const provider = vi.spyOn(globalThis, "fetch");
    const request = new Request("http://localhost:3000/api/table/voice/suggestions", {
      method: "POST",
      headers: { Cookie: `tablecast.device=${deviceToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        ...source,
        ...(kind === "別卓" ? { voiceSessionId: "tablecast-other-live" } : {}),
        ...(kind === "本文不一致" ? { text: "架空の案内" } : {}),
      }),
    });
    const context = createExecutionContext();
    const response = await app.fetch(request, configured(), context);
    await waitOnExecutionContext(context);
    expect(response.status).toBe(409);
    expect(provider).not.toHaveBeenCalled();
  },
);

it("候補生成中に停止すると返答例を返さない", async () => {
  await setupFixture();
  const services = createApiServices(configured());
  await setVoiceSession(services, device, sessionId);
  await saveAssistant(services);
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    await services.db
      .update(business.tableSessions)
      .set({ voice_state: "stopped" })
      .where(eq(business.tableSessions.id, device.tableSessionId));
    return modelResponse({ suggestions: ["説明をお願いします"] });
  });
  await expect(createVoiceSuggestions(services, device, source, signal())).rejects.toMatchObject({
    code: "VOICE_SESSION_STALE",
  });
});
