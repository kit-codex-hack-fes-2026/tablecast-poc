import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import * as business from "../src/db/business-schema";
import { getTableState } from "../src/modules/tables/queries";
import { changeLocale } from "../src/modules/tables/use-cases/presentation";
import { recordConversationItems } from "../src/modules/voice/conversation";
import { invokeVoiceTool } from "../src/modules/voice/realtime";
import { setVoiceSession } from "../src/modules/voice/service";
import { createApiServices } from "../src/platform/context";
import { configuration, device, setupFixture } from "./fixture";
import { runVoiceTurn } from "./voice-fixture";

afterEach(() => vi.restoreAllMocks());

it("言語変更は同じ音声接続を保ち、sidebandの更新ACKと古いturnの失効を確認する", async () => {
  await setupFixture();
  const services = createApiServices({ ...env, TABLECAST_MODEL_API_KEY: "tablecast-test-key" });
  await services.db
    .update(business.stores)
    .set({
      config_json: JSON.stringify({
        ...configuration,
        cast: {
          ...configuration.cast,
          systemInstructions: { ja: "TableCast system JA", en: "TableCast system EN" },
        },
      }),
    })
    .where(eq(business.stores.id, device.storeId));
  await setVoiceSession(services, device, "tablecast-language-live");
  const turn = await runVoiceTurn({
    voiceSessionId: "tablecast-language-live",
    turnId: "tablecast-old-language-turn",
    locale: "ja",
    messages: [],
  });
  await turn.finish();
  const pair = new WebSocketPair();
  pair[1].accept();
  const events: unknown[] = [];
  pair[1].addEventListener("message", ({ data }) => {
    const event = z
      .looseObject({ type: z.string(), event_id: z.string() })
      .parse(JSON.parse(String(data)));
    events.push(event);
    pair[1].send(
      JSON.stringify({
        type: event.type === "session.update" ? "session.updated" : "session.instructions.appended",
        client_event_id: event.event_id,
      }),
    );
  });
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, { status: 101, webSocket: pair[0] }),
  );
  try {
    const changed = await changeLocale(services, device, "en");
    expect(changed).toMatchObject({
      locale: "en",
      voiceSessionId: "tablecast-language-live",
      voiceState: "active",
    });
    expect(events).toHaveLength(2);
    expect(events[0]).toHaveProperty("type", "session.update");
    expect(events[0]).toHaveProperty(
      "session.delegation.responses.instructions",
      expect.stringContaining("British English"),
    );
    expect(events[1]).toHaveProperty("type", "session.instructions.append");
    expect(events[1]).toHaveProperty("content", expect.stringContaining("British English"));
    for (const [event, path] of [
      [events[0], "session.delegation.responses.instructions"],
      [events[1], "content"],
    ] as const) {
      expect(event).toHaveProperty(path, expect.stringContaining("TableCast system EN"));
      expect(event).toHaveProperty(path, expect.not.stringContaining("TableCast system JA"));
      expect(event).toHaveProperty(path, expect.stringContaining("captureCamera:"));
      expect(event).toHaveProperty(path, expect.stringContaining("showReference:"));
    }
    await expect(
      invokeVoiceTool(
        services,
        {
          voiceSessionId: "tablecast-language-live",
          turnId: "tablecast-old-language-turn",
          toolName: "getTableState",
          toolCallId: "tablecast-stale-language-call",
          arguments: {},
        },
        new AbortController().signal,
      ),
    ).rejects.toHaveProperty("code");
    expect(
      (
        await services.db
          .select()
          .from(business.voiceTurns)
          .where(eq(business.voiceTurns.id, "tablecast-old-language-turn"))
      )[0]?.status,
    ).toBe("interrupted");
  } finally {
    pair[1].close(1000);
  }
});

it("終了toolは後続の音声操作を拒否し、実際の停止までカートと接続IDを保持する", async () => {
  await setupFixture();
  const services = createApiServices(env);
  await setVoiceSession(services, device, "tablecast-ending-live");
  const before = await getTableState(services, device);
  const turn = await runVoiceTurn({
    voiceSessionId: "tablecast-ending-live",
    turnId: "tablecast-ending-turn",
    locale: "ja",
    messages: [],
  });
  await turn.finish();
  const result = await invokeVoiceTool(
    services,
    {
      voiceSessionId: "tablecast-ending-live",
      turnId: "tablecast-ending-turn",
      toolName: "endConversation",
      toolCallId: "tablecast-end-call",
      arguments: {},
    },
    new AbortController().signal,
  );
  expect(result).toMatchObject({ conversationAction: "end" });
  await expect(
    invokeVoiceTool(
      services,
      {
        voiceSessionId: "tablecast-ending-live",
        turnId: "tablecast-ending-turn",
        toolName: "callStaff",
        toolCallId: "tablecast-after-end",
        arguments: {},
      },
      new AbortController().signal,
    ),
  ).rejects.toHaveProperty("code");
  const after = await getTableState(services, device);
  expect(after.cart).toEqual(before.cart);
  expect(after.voiceSessionId).toBe("tablecast-ending-live");
  expect(after.staffCalled).toBe(false);
});

it("sidebandのACKが逆順でも最後に選んだ会話言語へ収束する", async () => {
  await setupFixture();
  const services = createApiServices({ ...env, TABLECAST_MODEL_API_KEY: "tablecast-test-key" });
  await setVoiceSession(services, device, "tablecast-language-race");
  const sockets: WebSocket[] = [];
  const batches: { content?: string; event_id: string; session?: unknown; type: string }[][] = [];
  const first = Promise.withResolvers<void>();
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    const pair = new WebSocketPair();
    pair[1].accept();
    sockets.push(pair[1]);
    const index = batches.length;
    const batch: (typeof batches)[number] = [];
    batches.push(batch);
    pair[1].addEventListener("message", ({ data }) => {
      const event = z
        .object({
          type: z.string(),
          event_id: z.string(),
          session: z.unknown().optional(),
          content: z.string().optional(),
        })
        .parse(JSON.parse(String(data)));
      batch.push(event);
      const acknowledge = () =>
        pair[1].send(
          JSON.stringify({
            type:
              event.type === "session.update" ? "session.updated" : "session.instructions.appended",
            client_event_id: event.event_id,
          }),
        );
      if (index === 0) void first.promise.then(acknowledge);
      else acknowledge();
    });
    return new Response(null, { status: 101, webSocket: pair[0] });
  });
  const english = changeLocale(services, device, "en");
  try {
    await vi.waitFor(() => expect(batches[0]).toHaveLength(2));
    await changeLocale(services, device, "ja");
    first.resolve();
    await english;
    expect(batches).toHaveLength(3);
    expect(batches[2]?.[1]?.content).toContain("日本語");
    expect(await getTableState(services, device)).toMatchObject({
      locale: "ja",
      voiceSessionId: "tablecast-language-race",
      voiceState: "active",
    });
  } finally {
    first.resolve();
    await english.catch(() => {});
    for (const socket of sockets) socket.close(1000);
  }
});

it("同じ音声sessionの旧言語の字幕保存は切替後も元の言語を保持する", async () => {
  await setupFixture();
  const services = createApiServices(env);
  await setVoiceSession(services, device, "tablecast-caption-language");
  await changeLocale(services, device, "en");
  await recordConversationItems(services, device, {
    voiceSessionId: "tablecast-caption-language",
    items: [
      {
        itemId: "tablecast-ja-caption",
        role: "assistant",
        locale: "ja",
        text: "お茶です",
        interrupted: true,
      },
    ],
  });
  const state = await getTableState(services, device);
  expect(state.events.find((event) => event.kind === "voice.assistant")?.data).toMatchObject({
    locale: "ja",
    interrupted: true,
    text: "お茶です",
  });
});

it("音声toolからの言語変更も同じ接続IDと切替結果を返せる", async () => {
  await setupFixture();
  const services = createApiServices(env);
  await setVoiceSession(services, device, "tablecast-tool-language");
  const turn = await runVoiceTurn({
    voiceSessionId: "tablecast-tool-language",
    turnId: "tablecast-tool-language-turn",
    locale: "ja",
    messages: [],
  });
  await turn.finish();
  const result = await invokeVoiceTool(
    services,
    {
      turnId: "tablecast-tool-language-turn",
      voiceSessionId: "tablecast-tool-language",
      toolName: "setLanguage",
      toolCallId: "tablecast-language-tool-call",
      arguments: { locale: "en" },
    },
    new AbortController().signal,
  );
  expect(result).toMatchObject({
    conversationAction: "language",
    locale: "en",
    result: { locale: "en", voiceState: "active" },
  });
  expect((await getTableState(services, device)).voiceSessionId).toBe("tablecast-tool-language");
});
