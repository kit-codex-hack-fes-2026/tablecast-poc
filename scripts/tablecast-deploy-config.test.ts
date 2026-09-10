import { describe, expect, test } from "vitest";
import {
  deploymentArtifact,
  deploymentConfigs,
  deploymentSecrets,
  deploymentTarget,
} from "./tablecast-deploy-config";

const input = {
  TABLECAST_CONTAINER_METRICS_TOKEN: "tablecast-analytics-secret",
  TABLECAST_OTEL_AUTHORIZATION: "tablecast-ingestion-secret",
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
  TABLECAST_BETTER_AUTH_API_KEY: "tablecast-dashboard-test-key",
  CF_ACCESS_CLIENT_ID: "tablecast-access-id",
  CF_ACCESS_CLIENT_SECRET: "tablecast-access-secret",
};

describe("本番とPRの配備境界", () => {
  test("Dashboardの鍵がある場合、本番だけへ渡してPRのsecretと公開configへ含めない", () => {
    expect(deploymentSecrets(deploymentTarget(), input).TABLECAST_BETTER_AUTH_API_KEY).toBe(
      input.TABLECAST_BETTER_AUTH_API_KEY,
    );
    expect(deploymentSecrets(deploymentTarget("75"), input)).not.toHaveProperty(
      "TABLECAST_BETTER_AUTH_API_KEY",
    );
    expect(
      JSON.stringify(
        deploymentConfigs(
          deploymentTarget(),
          "a".repeat(40),
          "11111111-1111-4111-8111-111111111111",
          "/tablecast",
          {},
          {},
        ),
      ),
    ).not.toContain(input.TABLECAST_BETTER_AUTH_API_KEY);
  });

  test("Dashboardの鍵がない場合、本番配備を拒否しPR配備は生成できる", () => {
    const missing = { ...input, TABLECAST_BETTER_AUTH_API_KEY: undefined };
    expect(() => deploymentSecrets(deploymentTarget(), missing)).toThrow(
      "TABLECAST_BETTER_AUTH_API_KEY",
    );
    expect(() => deploymentSecrets(deploymentTarget("75"), missing)).not.toThrow();
  });

  test("同じPRとSHAの成果物へ実DBと検証済みイメージを設定し別の配備先を拒否する", () => {
    const target = deploymentTarget("39");
    const sha = "a".repeat(40);
    const api = deploymentConfigs(
      target,
      sha,
      "11111111-1111-4111-8111-111111111111",
      "/tablecast",
      {},
      {},
    ).api;
    const artifact = { ...api, main: "index.js", no_bundle: true };
    const databaseId = "22222222-2222-4222-8222-222222222222";

    const deployed = deploymentArtifact(artifact, target, sha, databaseId);

    expect(deployed.main).toBe("index.js");
    expect(deployed.no_bundle).toBe(true);
    expect(deployed.d1_databases[0]?.database_id).toBe(databaseId);
    expect(deployed.containers.map((container) => container.image)).toEqual([
      `registry.cloudflare.com/dbbd52d7d690afceea41fe920ae19f91/tablecast-voice:${sha}`,
      `registry.cloudflare.com/dbbd52d7d690afceea41fe920ae19f91/tablecast-emulate:${sha}`,
    ]);
    expect(() => deploymentArtifact(artifact, target, "b".repeat(40), databaseId)).toThrow(
      "TABLECAST_RELEASE_SHA",
    );
    expect(() => deploymentArtifact(artifact, deploymentTarget(), sha, databaseId)).toThrow("name");
  });

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
    expect(config.api.triggers.crons).toEqual(["*/5 * * * *"]);
    expect(JSON.parse(config.api.vars.TABLECAST_CONTAINER_METRICS_APPLICATIONS)).toEqual([
      "tablecast-api-pr-34-tablecastvoice",
      "tablecast-api-pr-34-tablecastemulate",
    ]);
    expect(config.web).not.toHaveProperty("triggers");
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

test("previewのAPIとWebに同じPR番号を渡し送信資格を公開varsへ含めない", () => {
  const config = deploymentConfigs(
    deploymentTarget("123"),
    "a".repeat(40),
    "11111111-1111-4111-8111-111111111111",
    "/tablecast",
    {},
    {},
  );
  expect(config.api.vars.TABLECAST_PR_NUMBER).toBe("123");
  expect(config.web.vars.TABLECAST_PR_NUMBER).toBe("123");
  expect(config.web.vars.TABLECAST_ENV).toBe("preview");
  expect(config.web.vars.TABLECAST_RELEASE_SHA).toBe(config.api.vars.TABLECAST_RELEASE_SHA);
  expect(config.api.vars).not.toHaveProperty("TABLECAST_OTEL_AUTHORIZATION");
  expect(config.web.vars).not.toHaveProperty("TABLECAST_OTEL_AUTHORIZATION");
  const secrets = deploymentSecrets(deploymentTarget("123"), {
    ...input,
    TABLECAST_OTEL_AUTHORIZATION: "tablecast-ingestion-secret",
    TABLECAST_CONTAINER_METRICS_TOKEN: "tablecast-analytics-secret",
  });
  expect(secrets.TABLECAST_OTEL_AUTHORIZATION).toBe("tablecast-ingestion-secret");
  expect(secrets.TABLECAST_CONTAINER_METRICS_TOKEN).toBe("tablecast-analytics-secret");
  expect(JSON.stringify(config)).not.toContain("tablecast-analytics-secret");
});

test("本文収集はprodとpreviewで既定有効にし、明示falseで両Workerを切り替える", () => {
  for (const pr of [undefined, "123"]) {
    const args = [
      deploymentTarget(pr),
      "a".repeat(40),
      "11111111-1111-4111-8111-111111111111",
      "/tablecast",
      {},
      {},
    ] as const;
    expect(deploymentConfigs(...args).api.vars.TABLECAST_OTEL_CAPTURE_CONTENT).toBe("true");
    const disabled = deploymentConfigs(...args, "false");
    expect(disabled.api.vars.TABLECAST_OTEL_CAPTURE_CONTENT).toBe("false");
    expect(disabled.web.vars.TABLECAST_OTEL_CAPTURE_CONTENT).toBe("false");
    expect(() => deploymentConfigs(...args, "typo")).toThrow("Invalid option");
  }
});

test.each([
  { pr: undefined, environment: "本番" },
  { pr: "74", environment: "preview" },
])("$environmentで監視資格がなければ配備を拒否する", ({ pr }) => {
  // Given: Cronを登録する配備先と、片方が欠けた監視資格。
  for (const key of ["TABLECAST_CONTAINER_METRICS_TOKEN", "TABLECAST_OTEL_AUTHORIZATION"]) {
    // When / Then: Workerへの書込み前に不足した設定名で失敗する。
    expect(() => deploymentSecrets(deploymentTarget(pr), { ...input, [key]: undefined })).toThrow(
      key,
    );
  }
});
