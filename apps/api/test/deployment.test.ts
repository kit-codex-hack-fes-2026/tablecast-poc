import { env, exports } from "cloudflare:workers";
import { TokenVerifier } from "livekit-server-sdk";
import { expect, test } from "vitest";
import { createAuth } from "../src/modules/auth/service";
import { issueVoiceToken } from "../src/modules/voice/runtime";

test("資格なしで配備用drainを要求すると音声Containerへ到達しない", async () => {
  const response = await exports.default.fetch(
    new Request("http://localhost:3000/internal/deploy/drain", { method: "POST" }),
  );
  expect(response.status).toBe(401);
});

test("PR以外でOAuth emulatorの公開経路を要求すると拒否する", async () => {
  const response = await exports.default.fetch(
    new Request("http://localhost:3000/_tablecast/oauth/o/oauth2/v2/auth"),
  );
  expect(response.status).toBe(404);
});

test("本番へemulator設定が混入すると実Googleへ黙って切り替えず拒否する", () => {
  expect(() =>
    createAuth({
      ...env,
      TABLECAST_ENV: "production",
      TABLECAST_PUBLIC_ORIGIN: "https://tablecast.kit-codex.workers.dev",
      TABLECAST_GOOGLE_EMULATOR_URL: "http://tablecast-emulate",
    }),
  ).toThrow("OAUTH_EMULATOR_LOCAL_ONLY");
});

test("共有LiveKitへの参加tokenを生成すると対象PRのRoomとagentに限定する", async () => {
  const configured = {
    ...env,
    TABLECAST_AGENT_NAME: "tablecast-voice-pr-34",
    TABLECAST_CONTAINERS_ENABLED: "false",
    TABLECAST_LIVEKIT_URL: "wss://tablecast.example.test",
    TABLECAST_LIVEKIT_API_KEY: "tablecast-test-key",
    TABLECAST_LIVEKIT_API_SECRET: "tablecast-test-secret",
    TABLECAST_MODEL_API_KEY: "tablecast-model-key",
  };
  const result = await issueVoiceToken(configured, "tablecast-session");
  const claims = await new TokenVerifier(
    configured.TABLECAST_LIVEKIT_API_KEY,
    configured.TABLECAST_LIVEKIT_API_SECRET,
  ).verify(result.token);
  expect(claims.video?.room).toBe("tablecast-voice-pr-34-tablecast-session");
  expect(claims.roomConfig?.agents[0]?.agentName).toBe("tablecast-voice-pr-34");
});
