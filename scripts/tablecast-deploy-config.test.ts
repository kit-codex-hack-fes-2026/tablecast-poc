import { describe, expect, test } from "vitest";
import { deploymentConfigs, deploymentSecrets, deploymentTarget } from "./tablecast-deploy-config";

const input = {
  TABLECAST_RUNTIME_SECRETS: JSON.stringify({
    LIVEKIT_URL: "wss://tablecast.example.test",
    LIVEKIT_API_KEY: "tablecast-livekit-key",
    LIVEKIT_API_SECRET: "tablecast-livekit-secret",
    OPENAI_API_KEY: "tablecast-openai-secret",
    INWORLD_API_KEY: "tablecast-inworld-secret",
    TABLECAST_MODEL: "tablecast-test-model",
  }),
  TABLECAST_DEPLOY_SECRET: "tablecast-deployment-test-master-secret",
  TABLECAST_GOOGLE_CLIENT_ID: "tablecast-google-id",
  TABLECAST_GOOGLE_CLIENT_SECRET: "tablecast-google-secret",
  CF_ACCESS_CLIENT_ID: "tablecast-access-id",
  CF_ACCESS_CLIENT_SECRET: "tablecast-access-secret",
};

describe("本番とPRの配備境界", () => {
  test("本番を生成するとGoogleに登録した単一originと非公開APIになる", () => {
    const target = deploymentTarget();
    const config = deploymentConfigs(
      target,
      "a".repeat(40),
      "11111111-1111-4111-8111-111111111111",
      "/tablecast",
      {},
      {},
    );
    expect(target.origin).toBe("https://tablecast.kit-codex.workers.dev");
    expect(config.api.vars.TABLECAST_PUBLIC_ORIGIN + "/api/auth/callback/google").toBe(
      "https://tablecast.kit-codex.workers.dev/api/auth/callback/google",
    );
    expect(config.api.workers_dev).toBe(false);
    expect(config.api.vars).not.toHaveProperty("TABLECAST_GOOGLE_EMULATOR_URL");
    expect(config.api.vars).not.toHaveProperty("TABLECAST_GOOGLE_AUTHORIZE_URL");
    expect(config.web.services).toEqual([{ binding: "TABLECAST_API", service: "tablecast-api" }]);
    expect(deploymentSecrets(target, input).TABLECAST_GOOGLE_CLIENT_SECRET).toBe(
      "tablecast-google-secret",
    );
  });

  test("同じ外部キーで二つのPRを生成するとGoogle資格を渡さず内部鍵と資源を分離する", () => {
    const first = deploymentTarget("34");
    const second = deploymentTarget("35");
    const firstSecrets = deploymentSecrets(first, input);
    const secondSecrets = deploymentSecrets(second, input);
    expect(first.origin).toBe("https://tablecast-pr-34.kit-codex.workers.dev");
    for (const key of ["web", "api", "database", "bucket", "agent"] as const)
      expect(first[key]).not.toBe(second[key]);
    expect(firstSecrets.TABLECAST_GOOGLE_CLIENT_SECRET).toBeUndefined();
    expect(firstSecrets.TABLECAST_GOOGLE_CLIENT_ID).toBeUndefined();
    expect(firstSecrets.OPENAI_API_KEY).toBe(secondSecrets.OPENAI_API_KEY);
    expect(firstSecrets.TABLECAST_AUTH_SECRET).not.toBe(secondSecrets.TABLECAST_AUTH_SECRET);
    expect(firstSecrets.TABLECAST_VOICE_API_TOKEN).not.toBe(
      secondSecrets.TABLECAST_VOICE_API_TOKEN,
    );
    expect(deploymentSecrets(first, input).TABLECAST_AUTH_SECRET).toBe(
      firstSecrets.TABLECAST_AUTH_SECRET,
    );
  });

  test("PR設定を生成すると専用OAuthと各1台のContainerを配備する", () => {
    const config = deploymentConfigs(
      deploymentTarget("34"),
      "a".repeat(40),
      "11111111-1111-4111-8111-111111111111",
      "/tablecast",
      {},
      {},
    );
    expect(config.api.vars.TABLECAST_ENV).toBe("preview");
    expect(config.api.vars.TABLECAST_GOOGLE_AUTHORIZE_URL).toBe(
      "https://tablecast-pr-34.kit-codex.workers.dev/_tablecast/oauth",
    );
    expect(config.api.containers).toHaveLength(2);
    expect(config.api.containers.every((value) => value.max_instances === 1)).toBe(true);
    expect(JSON.stringify(config)).not.toContain("tablecast-openai-secret");
  });

  test.each(["0", "-1", "../main", "main", "34; echo secret", "1.2"])(
    "不正なPR番号%sでは資源名を生成しない",
    (value) => {
      expect(() => deploymentTarget(value)).toThrow("PR番号が不正");
    },
  );

  test("Access資格がないPRを配備しようとすると拒否する", () => {
    expect(() =>
      deploymentSecrets(deploymentTarget("34"), { ...input, CF_ACCESS_CLIENT_SECRET: undefined }),
    ).toThrow("CF_ACCESS_CLIENT_SECRET");
  });
});
