import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { and, desc, eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import app from "../src/app";
import * as business from "../src/db/business-schema";
import { getTableState } from "../src/modules/tables/queries";
import { getAdminState, getEvents } from "../src/modules/stores/queries";
import { recordConversationItems } from "../src/modules/voice/conversation";
import { createVoiceOpening, createVoiceSuggestions } from "../src/modules/voice/guidance";
import { setVoiceSession } from "../src/modules/voice/service";
import { createApiServices } from "../src/platform/context";
import { configuration, device, deviceToken, setupFixture, text as localizedText } from "./fixture";

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
  expect(state.events.filter((event) => event.kind === "voice.opening")).toEqual([]);
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

it("同じ字幕の並行要求と再送は一度だけ生成し、本文の更新では再生成できる", async () => {
  await setupFixture();
  const services = createApiServices(configured());
  await setVoiceSession(services, device, sessionId);
  await saveAssistant(services);
  const provider = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async () =>
      modelResponse({ suggestions: ["ほうじ茶について教えてください"] }),
    );
  const results = await Promise.allSettled([
    createVoiceSuggestions(services, device, source, signal()),
    createVoiceSuggestions(services, device, source, signal()),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  await expect(createVoiceSuggestions(services, device, source, signal())).rejects.toMatchObject({
    code: "VOICE_GUIDANCE_UNAVAILABLE",
  });
  expect(provider).toHaveBeenCalledOnce();
  const updated = source.text + " ほうじ茶についてもご紹介できます。";
  await saveAssistant(services, updated);
  await createVoiceSuggestions(services, device, { ...source, text: updated }, signal());
  expect(provider).toHaveBeenCalledTimes(2);
});

it("接続の生成上限を守り、内部予約で公開履歴を埋めない", async () => {
  await setupFixture();
  const services = createApiServices(configured());
  await setVoiceSession(services, device, sessionId);
  await saveAssistant(services);
  const rows = Array.from({ length: 119 }, (_, index) => ({
    store_id: device.storeId,
    table_session_id: device.tableSessionId ?? "",
    kind: "voice.suggestions",
    created_at: Date.now(),
    data_json: JSON.stringify({
      voiceSessionId: sessionId,
      reservationKey: `tablecast-prior-${index}`,
    }),
  }));
  await services.db.batch([
    services.db.insert(business.tableEvents).values(rows.slice(0, 20)),
    ...Array.from({ length: 5 }, (_, index) =>
      services.db
        .insert(business.tableEvents)
        .values(rows.slice((index + 1) * 20, (index + 2) * 20)),
    ),
  ]);
  const provider = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async () =>
      modelResponse({ suggestions: ["ほうじ茶について教えてください"] }),
    );
  await createVoiceSuggestions(services, device, source, signal());
  const updated = source.text + " ほうじ茶をご用意しています。";
  await saveAssistant(services, updated);
  await expect(
    createVoiceSuggestions(services, device, { ...source, text: updated }, signal()),
  ).rejects.toMatchObject({ code: "VOICE_GUIDANCE_UNAVAILABLE" });
  expect(provider).toHaveBeenCalledOnce();
  const state = await getTableState(services, device);
  const reservation = await services.db
    .select()
    .from(business.tableEvents)
    .where(
      and(
        eq(business.tableEvents.store_id, device.storeId),
        eq(business.tableEvents.kind, "voice.suggestions"),
      ),
    )
    .orderBy(desc(business.tableEvents.cursor))
    .get();
  const data = z
    .object({ voiceSessionId: z.literal(sessionId), reservationKey: z.string() })
    .strict()
    .parse(JSON.parse(reservation?.data_json ?? "null"));
  expect(data.reservationKey).toMatch(/^[a-f0-9]{64}$/);
  const staff = { kind: "staff", storeId: device.storeId, role: "owner" } as const;
  const admin = await getAdminState(services, staff);
  const deviceEvents = await getEvents(services, device);
  const staffEvents = await getEvents(services, staff);
  const table = admin.tables.find((row) => row.id === device.tableSessionId);
  expect(table).toBeDefined();
  for (const events of [
    state.events,
    table?.events ?? [],
    admin.events,
    deviceEvents.events,
    staffEvents.events,
  ]) {
    expect(events.some((event) => event.kind === "voice.started")).toBe(true);
    expect(events.some((event) => event.kind === "voice.assistant")).toBe(true);
    expect(
      events.filter((event) => ["voice.opening", "voice.suggestions"].includes(event.kind)),
    ).toEqual([]);
  }
  await recordConversationItems(services, device, {
    voiceSessionId: sessionId,
    items: [
      {
        itemId: "tablecast-next-user",
        role: "user",
        text: "詳しく教えてください",
        interrupted: false,
      },
    ],
  });
  const next = await getEvents(services, device, deviceEvents.cursor);
  expect(next.events.map((event) => event.kind)).toEqual(["voice.user"]);
  expect(next.cursor).toBeGreaterThan(deviceEvents.cursor);
});

it("公開された店舗方針と会話中の商品を優先し、長い候補を省略せず返す", async () => {
  await setupFixture();
  const services = createApiServices(configured());
  const menu = structuredClone(configuration);
  menu.cast.openingInstructions = {
    ja: "ほうじ茶の味わいを案内する",
    en: "Explain our roasted green tea",
  };
  const base = configuration.products[0];
  if (!base) throw new Error("商品fixtureが必要です");
  menu.products = Array.from({ length: 20 }, (_, index) => ({
    ...base,
    id: `tablecast-drink-${index}`,
    text: localizedText(`お茶${index}号`, `Tea number ${index}`),
    price: 400 + index,
    available: index !== 19,
  }));
  await services.db
    .update(business.stores)
    .set({ config_json: JSON.stringify(menu) })
    .where(eq(business.stores.id, device.storeId));
  await setVoiceSession(services, device, sessionId);
  const latest = "お茶18号とお茶19号をご紹介しました。どちらについて詳しく知りたいですか？";
  await saveAssistant(services, latest);
  const long =
    "お茶18号について、香りや味わい、どのような料理と合わせるとよいかを教えてください。".repeat(4);
  const provider = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(modelResponse({ suggestions: [long] }));
  expect(
    (await createVoiceSuggestions(services, device, { ...source, text: latest }, signal()))
      .suggestions,
  ).toEqual([long]);
  const request = z
    .object({ input: z.string() })
    .parse(JSON.parse(z.string().parse(provider.mock.calls[0]?.[1]?.body)));
  const context = z
    .object({
      storeName: z.string(),
      instructions: z.string(),
      openingInstructions: z.string(),
      menu: z.object({
        products: z.array(
          z.object({
            id: z.string(),
            displayName: z.string(),
            price: z.number(),
            available: z.boolean(),
          }),
        ),
      }),
    })
    .parse(JSON.parse(request.input));
  expect(context).toMatchObject({
    storeName: "卓上喫茶",
    instructions: "丁寧な接客",
    openingInstructions: "ほうじ茶の味わいを案内する",
  });
  expect(context.menu.products).toEqual([
    expect.objectContaining({
      id: "tablecast-drink-18",
      displayName: "お茶18号",
      price: 418,
      available: true,
    }),
    expect.objectContaining({
      id: "tablecast-drink-19",
      displayName: "お茶19号",
      price: 419,
      available: false,
    }),
  ]);
  expect(provider).toHaveBeenCalledOnce();
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
