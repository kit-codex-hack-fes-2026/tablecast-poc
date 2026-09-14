import { afterEach, expect, it, vi } from "vitest";
import { setVoiceSession } from "../src/modules/voice/service";
import { createApiServices } from "../src/platform/context";
import { voiceBindings, runVoiceTurn } from "./voice-fixture";
import { device, setupFixture } from "./fixture";
afterEach(() => vi.restoreAllMocks());
it("委任登録のログへ会話本文や資格を含めない", async () => {
  await setupFixture();
  const bindings = voiceBindings();
  await setVoiceSession(createApiServices(bindings), device, "tablecast-private-voice");
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const running = await runVoiceTurn({
    voiceSessionId: "tablecast-private-voice",
    turnId: "tablecast-diagnostics-turn",
    locale: "ja",
    messages: [{ role: "user", content: "tablecast-private-conversation" }],
  });
  await running.finish();
  expect(running.result.kind).toBe("accepted");
  const logged = JSON.stringify(info.mock.calls);
  expect(logged).not.toContain("tablecast-private-conversation");
  expect(logged).not.toContain(bindings.TABLECAST_MODEL_API_KEY);
});
