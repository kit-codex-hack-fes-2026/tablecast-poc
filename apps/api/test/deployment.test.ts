import { env, exports } from "cloudflare:workers";
import { expect, test } from "vitest";
import { verificationEmail } from "../src/emails/account-content";
import { sendAccountEmail } from "../src/emails/send";
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

test("開発のlocalhostサブドメインで模擬Googleへの認証を開始できる", async () => {
  const auth = createAuth({
    ...env,
    TABLECAST_ENV: "development",
    TABLECAST_PUBLIC_ORIGIN: "http://web.0123456789.tablecast-poc.localhost",
    TABLECAST_GOOGLE_EMULATOR_URL: "http://oauth.0123456789.tablecast-poc.localhost",
  });
  const result = await auth.api.signInSocial({ body: { provider: "google" } });
  expect(new URL(result.url ?? "").origin).toBe("http://oauth.0123456789.tablecast-poc.localhost");
});

test.each([
  { environment: "development", host: "oauth.0123456789.tablecast-poc.localhost.example.com" },
  { environment: "production", host: "oauth.0123456789.tablecast-poc.localhost" },
])("$environmentの模擬OAuthで$hostを拒否する", ({ environment, host }) => {
  expect(() =>
    createAuth({
      ...env,
      TABLECAST_ENV: environment,
      TABLECAST_PUBLIC_ORIGIN: "http://web.0123456789.tablecast-poc.localhost",
      TABLECAST_GOOGLE_EMULATOR_URL: `http://${host}`,
    }),
  ).toThrow("OAUTH_EMULATOR_LOCAL_ONLY");
});

test("stagingは固定originだけで模擬OAuthを許可する", async () => {
  const { isHostedEmulator } = await import("../src/modules/auth/preview");
  expect(
    isHostedEmulator({
      TABLECAST_ENV: "staging",
      TABLECAST_PUBLIC_ORIGIN: "https://tablecast-staging.kit-codex.workers.dev",
    }),
  ).toBe(true);
  expect(
    isHostedEmulator({
      TABLECAST_ENV: "staging",
      TABLECAST_PUBLIC_ORIGIN: "https://tablecast.kit-codex.workers.dev",
    }),
  ).toBe(false);
  expect(
    isHostedEmulator({
      TABLECAST_ENV: "production",
      TABLECAST_PUBLIC_ORIGIN: "https://tablecast-staging.kit-codex.workers.dev",
    }),
  ).toBe(false);
});

test.each([
  {
    environment: "preview",
    origin: "https://tablecast-square-sandbox.kit-codex.workers.dev",
    allowed: true,
  },
  {
    environment: "production",
    origin: "https://tablecast-square-sandbox.kit-codex.workers.dev",
    allowed: false,
  },
  {
    environment: "preview",
    origin: "https://tablecast-square-sandbox.kit-codex.workers.dev.example.com",
    allowed: false,
  },
])(
  "固定Square検証環境のOAuthは$environment/$originの境界を守る",
  async ({ environment, origin, allowed }) => {
    const { isHostedEmulator } = await import("../src/modules/auth/preview");
    expect(isHostedEmulator({ TABLECAST_ENV: environment, TABLECAST_PUBLIC_ORIGIN: origin })).toBe(
      allowed,
    );
  },
);

test.each([
  { environment: "development", host: "mailpit.0123456789.tablecast-poc.localhost.example.com" },
  { environment: "production", host: "mailpit.0123456789.tablecast-poc.localhost" },
])("$environmentのメール送信で$hostを拒否する", async ({ environment, host }) => {
  await expect(
    sendAccountEmail(
      {
        ...env,
        TABLECAST_ENV: environment,
        TABLECAST_EMAIL_FROM: "tablecast@localhost.test",
        TABLECAST_MAILPIT_URL: `http://${host}`,
      },
      "tablecast@example.invalid",
      verificationEmail("http://localhost:3000", "ja"),
    ),
  ).rejects.toThrow("MAILPIT_LOCAL_ONLY");
});
