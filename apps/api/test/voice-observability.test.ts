import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, expect, it, vi } from "vitest";
import app from "../src/app";
import { customerContexts } from "../src/db/customer-schema";
import { recordVoiceObservations } from "../src/modules/voice/observability";
import { setVoiceSession } from "../src/modules/voice/service";
import { createApiServices } from "../src/platform/context";
import { device, deviceToken, setupFixture } from "./fixture";

afterEach(() => vi.restoreAllMocks());
const event = () => ({
  eventId: "tablecast-observed-response",
  kind: "response" as const,
  startedAt: Date.now() - 20,
  endedAt: Date.now(),
  responseId: "tablecast-response",
  content: "会話とtablecast-private-model-key",
  model: "gpt-6.1-terra",
  usage: { input_tokens: 12, output_tokens: 3 },
});

it("認可済みの卓から受けたモデル履歴を秘匿化し本文停止でもusageを残す", async () => {
  await setupFixture();
  const bindings = {
    ...env,
    TABLECAST_OTEL_CAPTURE_CONTENT: "true",
    TABLECAST_MODEL_API_KEY: "tablecast-private-model-key",
  };
  await setVoiceSession(createApiServices(bindings), device, "tablecast-live");
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const ctx = createExecutionContext();
  const response = await app.fetch(
    new Request("http://localhost:3000/api/table/voice/observations", {
      method: "POST",
      headers: { Cookie: `tablecast.device=${deviceToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ voiceSessionId: "tablecast-live", events: [event()] }),
    }),
    bindings,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  expect(response.status).toBe(200);
  const logged = JSON.stringify(log.mock.calls);
  expect(logged).toContain("会話");
  expect(logged).not.toContain("tablecast-private-model-key");
  expect(logged).toContain("tablecast-response");
  log.mockClear();
  await recordVoiceObservations(
    createApiServices({ ...bindings, TABLECAST_OTEL_CAPTURE_CONTENT: "false" }),
    device,
    { voiceSessionId: "tablecast-live", events: [event()] },
  );
  expect(JSON.stringify(log.mock.calls)).not.toContain("会話");
  expect(JSON.stringify(log.mock.calls)).toContain("gen_ai.usage.input_tokens");
});

it("他卓・停止済みsession・不正な時刻を拒否し会員参加後の本文を収集しない", async () => {
  await setupFixture();
  const services = createApiServices({ ...env, TABLECAST_OTEL_CAPTURE_CONTENT: "true" });
  await setVoiceSession(services, device, "tablecast-live");
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  await expect(
    recordVoiceObservations(
      services,
      { ...device, tableSessionId: "tablecast-other-table" },
      { voiceSessionId: "tablecast-live", events: [event()] },
    ),
  ).rejects.toMatchObject({ code: "VOICE_SESSION_STALE" });
  await expect(
    recordVoiceObservations(services, device, {
      voiceSessionId: "tablecast-live",
      events: [event(), { ...event(), eventId: "invalid", startedAt: 0 }],
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(log).not.toHaveBeenCalled();
  await services.db.insert(customerContexts).values({
    sessionId: device.tableSessionId,
    storeId: device.storeId,
    token: "tablecast-personal-context",
  });
  await recordVoiceObservations(services, device, {
    voiceSessionId: "tablecast-live",
    events: [event()],
  });
  expect(log).not.toHaveBeenCalled();
  await setVoiceSession(services, device, null);
  await expect(
    recordVoiceObservations(services, device, {
      voiceSessionId: "tablecast-live",
      events: [event()],
    }),
  ).rejects.toMatchObject({ code: "VOICE_SESSION_STALE" });
});
