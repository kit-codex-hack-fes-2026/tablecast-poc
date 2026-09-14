import { env, exports } from "cloudflare:workers";
import { expect, test } from "vitest";
import { createAuth } from "../src/modules/auth/service";

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
