import { env } from "cloudflare:workers";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import * as business from "../src/db/business-schema";
import { setVoiceSession } from "../src/modules/voice/service";
import { createApiServices } from "../src/platform/context";
import { agentBindings, mockAgentSessions, runVoiceTurn, voiceTurnText } from "./agents-fixture";
import { device, setupFixture } from "./fixture";

afterEach(() => vi.restoreAllMocks());
const voiceId = "tablecast-diagnostics-voice";
const privateText = "tablecast-private-conversation";
const privateReply = "tablecast-private-reply";
const privateKey = "tablecast-private-model-key";
const input = {
  voiceSessionId: voiceId,
  turnId: "tablecast-diagnostics-turn",
  locale: "ja",
  messages: [{ role: "user", content: privateText }],
};

it.each(["完了", "失敗"])(
  "%sの診断にAPI session相関だけを残し本文や資格を出さない",
  async (scenario) => {
    await setupFixture();
    await setVoiceSession(createApiServices(env), device, voiceId);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mockAgentSessions([
      [{ text: privateReply }, ...(scenario === "失敗" ? [{ failure: true as const }] : [])],
    ]);
    const running = await runVoiceTurn(input, {
      ...agentBindings(),
      TABLECAST_MODEL_API_KEY: privateKey,
    });
    if (running.result.kind !== "stream") throw new Error("応答streamがない");
    const response = voiceTurnText(running.result);
    const outcome = await response.catch((failure: unknown) =>
      failure instanceof Error ? failure.message : "unknown",
    );
    expect(outcome).toBe(scenario === "失敗" ? "VOICE_MODEL_FAILED" : privateReply);
    await running.finish();
    const logs = info.mock.calls
      .map(([line]) =>
        z
          .looseObject({ event: z.string(), phase: z.string().optional() })
          .parse(JSON.parse(String(line))),
      )
      .filter((entry) => entry.event === "tablecast.voice_turn");
    expect(logs.map((entry) => entry.phase)).toEqual([
      "accepted",
      scenario === "失敗" ? "failed" : "generated",
    ]);
    expect(logs[1]).toMatchObject({
      traceId: running.diagnostics.traceId,
      voiceSessionId: voiceId,
      turnId: input.turnId,
      runId: "tablecast-agent-1",
    });
    const persisted = await createApiServices(env)
      .db.select()
      .from(business.voiceTurns)
      .where(eq(business.voiceTurns.id, input.turnId))
      .get();
    expect(persisted?.agent_session_id).toBe("tablecast-agent-1");
    const output = JSON.stringify([info.mock.calls, warn.mock.calls, error.mock.calls]);
    for (const secret of [
      privateText,
      privateReply,
      privateKey,
      "tablecast-private-provider-error",
    ])
      expect(output).not.toContain(secret);
  },
);
