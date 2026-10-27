import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import app from "../src/app";
import { getTableState } from "../src/modules/tables/queries";
import { invokeVoiceTool } from "../src/modules/voice/realtime";
import { setVoiceSession } from "../src/modules/voice/service";
import { createApiServices } from "../src/platform/context";
import { device, deviceToken, setupFixture } from "./fixture";
import { runVoiceTurn } from "./voice-fixture";

const input = {
  voiceSessionId: "tablecast-camera-live",
  turnId: "tablecast-camera-turn",
  toolName: "captureCamera" as const,
  toolCallId: "tablecast-camera-call",
  arguments: { question: "見えている物を教えてください" },
};
it("認可したカメラtoolは取得要求だけを返し、画像を履歴へ保存しない", async () => {
  await setupFixture();
  const services = createApiServices(env);
  await setVoiceSession(services, device, input.voiceSessionId);
  const turn = await runVoiceTurn({
    voiceSessionId: input.voiceSessionId,
    turnId: input.turnId,
    locale: "ja",
    messages: [],
  });
  await turn.finish();
  expect(await invokeVoiceTool(services, input, new AbortController().signal)).toEqual({
    result: input.arguments,
    cameraAction: "capture",
  });
  const state = await getTableState(services, device);
  expect(JSON.stringify(state.events)).not.toContain("data:image");
  expect(state.orders).toHaveLength(0);
});

it("別のsessionと停止後のカメラ要求は認証済みHTTP入口でも拒否する", async () => {
  await setupFixture();
  const services = createApiServices(env);
  await setVoiceSession(services, device, input.voiceSessionId);
  const request = (voiceSessionId: string) =>
    new Request("http://localhost:3000/api/table/voice/tools", {
      method: "POST",
      headers: { Cookie: `tablecast.device=${deviceToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, voiceSessionId }),
    });
  expect((await app.request(request("tablecast-other-live"), undefined, env)).status).toBe(409);
  await setVoiceSession(services, device, null);
  expect((await app.request(request(input.voiceSessionId), undefined, env)).status).toBe(409);
});
