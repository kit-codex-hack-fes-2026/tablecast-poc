import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import * as business from "../src/db/business-schema";
import { getTableState } from "../src/modules/tables/queries";
import { changeLocale } from "../src/modules/tables/use-cases/presentation";
import { invokeVoiceTool } from "../src/modules/voice/realtime";
import { setVoiceSession } from "../src/modules/voice/service";
import { createApiServices } from "../src/platform/context";
import { device, setupFixture } from "./fixture";
import { runVoiceTurn } from "./voice-fixture";

afterEach(() => vi.restoreAllMocks());

it("言語変更は同じ音声接続を保ち、sidebandの更新ACKと古いturnの失効を確認する", async () => {
  await setupFixture();
  const services = createApiServices({ ...env, TABLECAST_MODEL_API_KEY: "tablecast-test-key" });
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
