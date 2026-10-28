import { convertToWranglerConfig, InputConfigSchema } from "@cloudflare/config";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { apiSdkConfiguration } from "../apps/api/cloudflare.config.ts";
import { webCloudflareConfig } from "../apps/web/cloudflare.config.ts";
import {
  bindDeploymentDatabase,
  deploymentOptions,
  deploymentSecrets,
  deploymentTarget,
  optionsSchema,
} from "./tablecast-deploy-config.ts";
import { workerConfigurationDiff } from "./tablecast-infra-diff.ts";

function deploymentConfigs(...args: Parameters<typeof deploymentOptions>) {
  const options = deploymentOptions(...args);
  const web = convertToWranglerConfig(InputConfigSchema.parse(webCloudflareConfig(options.web)));
  return {
    api: apiSdkConfiguration(options.api),
    web: { ...web, vars: optionsSchema.shape.vars.parse(web.vars) },
  };
}

const input = {
  TABLECAST_CONTAINER_METRICS_TOKEN: "tablecast-analytics-secret",
  TABLECAST_OTEL_AUTHORIZATION: "tablecast-ingestion-secret",
  TABLECAST_RUNTIME_SECRETS: JSON.stringify({
    TABLECAST_MODEL_API_KEY: "tablecast-openai-secret",
    TABLECAST_MODEL: "tablecast-test-model",
  }),
  TABLECAST_DEPLOY_SECRET: "tablecast-deployment-test-master-secret",
  TABLECAST_GOOGLE_CLIENT_ID: "tablecast-google-id",
  TABLECAST_GOOGLE_CLIENT_SECRET: "tablecast-google-secret",
  TABLECAST_BETTER_AUTH_API_KEY: "tablecast-dashboard-test-key",
  CF_ACCESS_CLIENT_ID: "tablecast-access-id",
  CF_ACCESS_CLIENT_SECRET: "tablecast-access-secret",
};
beforeEach(() => vi.stubEnv("TABLECAST_EMAIL_FROM", "tablecast@example.test"));
afterEach(() => vi.unstubAllEnvs());

describe("本番とPRの配備境界", () => {
  test.each([undefined, "", "kit-codex.workers.dev"])(
    "本番の送信元が未設定または不正な%sなら資源変更前に拒否する",
    (value) => {
      vi.stubEnv("TABLECAST_EMAIL_FROM", value);
      expect(() =>
        deploymentOptions(
          deploymentTarget(),
          "a".repeat(40),
          "11111111-1111-4111-8111-111111111111",
        ),
      ).toThrow("TABLECAST_EMAIL_FROM");
    },
  );

  test("配備入力の送信元をWorkerと公式send_email bindingの同じ制限へ渡す", () => {
    const config = deploymentConfigs(
      deploymentTarget(),
      "a".repeat(40),
      "11111111-1111-4111-8111-111111111111",
    );
    expect(config.api.vars.TABLECAST_EMAIL_FROM).toBe("tablecast@example.test");
    expect(config.api.send_email).toEqual([
      { name: "TABLECAST_EMAIL", allowed_sender_addresses: ["tablecast@example.test"] },
    ]);
    expect(config.web.vars).not.toHaveProperty("TABLECAST_EMAIL_FROM");
  });

  test("送信元の制限だけが変わったbindingもIaCの更新対象にする", () => {
    const configured = {
      send_email: [
        { name: "TABLECAST_EMAIL", allowed_sender_addresses: ["tablecast@example.test"] },
      ],
    };
    const actual = {
      placement: {},
      bindings: [
        {
          name: "TABLECAST_EMAIL",
          type: "send_email",
          allowed_sender_addresses: ["other@example.test"],
        },
      ],
    };
    expect(workerConfigurationDiff(configured, actual, { schedules: [] })).toEqual([
      "bindings.TABLECAST_EMAIL",
    ]);
    expect(
      workerConfigurationDiff(
        configured,
        {
          ...actual,
          bindings: [
            {
              name: "TABLECAST_EMAIL",
              type: "send_email",
              allowed_sender_addresses: ["tablecast@example.test"],
            },
          ],
        },
        { schedules: [] },
      ),
    ).toEqual([]);
  });
  test.each([undefined, ""])("課金設定が未設定または空文字%sなら両機能を無効にする", (value) => {
    vi.stubEnv("TABLECAST_BILLING_CONFIG", value);
    const target = deploymentTarget("338");
    const config = deploymentConfigs(
      target,
      "a".repeat(40),
      "11111111-1111-4111-8111-111111111111",
    );
    expect(config.api.vars.TABLECAST_BILLING_ENABLED).toBe("false");
    expect(config.api.vars.TABLECAST_ORGANIZATION_AI_ENABLED).toBe("false");
    expect(deploymentSecrets(target, input)).not.toHaveProperty("TABLECAST_STRIPE_SECRET_KEY");
    expect(deploymentSecrets(target, input)).not.toHaveProperty("TABLECAST_OPENAI_ADMIN_API_KEY");
  });

  test("空文字でない不正な課金設定は配備を拒否する", () => {
    vi.stubEnv("TABLECAST_BILLING_CONFIG", "{");
    expect(() =>
      deploymentOptions(
        deploymentTarget("338"),
        "a".repeat(40),
        "11111111-1111-4111-8111-111111111111",
      ),
    ).toThrow(SyntaxError);
  });

  test("Langfuseの資格情報をpreviewとstagingのAPIだけへ渡し本番・Webへ含めない", () => {
    vi.stubEnv("TABLECAST_LANGFUSE_PUBLIC_KEY", "pk-lf-tablecast-fixture");
    const keys = {
      ...input,
      TABLECAST_LANGFUSE_PUBLIC_KEY: "pk-lf-tablecast-fixture",
      TABLECAST_LANGFUSE_SECRET_KEY: "sk-lf-tablecast-fixture",
    };
    for (const target of [deploymentTarget("424"), deploymentTarget(undefined, "staging")]) {
      const config = deploymentConfigs(
        target,
        "a".repeat(40),
        "11111111-1111-4111-8111-111111111111",
      );
      expect(config.api.vars.TABLECAST_LANGFUSE_BASE_URL).toBe("https://jp.cloud.langfuse.com");
      expect(config.web.vars).not.toHaveProperty("TABLECAST_LANGFUSE_BASE_URL");
      expect(deploymentSecrets(target, keys)).toMatchObject({
        TABLECAST_LANGFUSE_PUBLIC_KEY: keys.TABLECAST_LANGFUSE_PUBLIC_KEY,
        TABLECAST_LANGFUSE_SECRET_KEY: keys.TABLECAST_LANGFUSE_SECRET_KEY,
      });
      expect(JSON.stringify(config)).not.toContain(keys.TABLECAST_LANGFUSE_SECRET_KEY);
      expect(() =>
        deploymentSecrets(target, { ...keys, TABLECAST_LANGFUSE_SECRET_KEY: undefined }),
      ).toThrow("TABLECAST_LANGFUSE_SECRET_KEY");
    }
    const production = deploymentTarget();
    expect(deploymentSecrets(production, keys)).not.toHaveProperty("TABLECAST_LANGFUSE_SECRET_KEY");
    expect(
      deploymentConfigs(production, "a".repeat(40), "11111111-1111-4111-8111-111111111111").api
        .vars,
    ).not.toHaveProperty("TABLECAST_LANGFUSE_BASE_URL");
  });

  test("配備時に指定した業務モデルを優先し既存のAPIキーを維持する", () => {
    const secrets = deploymentSecrets(deploymentTarget("104"), {
      ...input,
      TABLECAST_MODEL: "gpt-6.1-terra",
    });
    expect(secrets.TABLECAST_MODEL).toBe("gpt-6.1-terra");
    expect(secrets.TABLECAST_MODEL_API_KEY).toBe("tablecast-openai-secret");
  });

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

  test("実D1の補完は対象APIだけを変更しWorkerのmanifestを保持する", () => {
    const target = deploymentTarget("39");
    const artifact = {
      name: target.api,
      compatibilityDate: "2026-09-03",
      manifest: {
        type: "complete",
        mainModule: "index.js",
        modules: { "index.js": { type: "esm" } },
      },
      env: {
        TABLECAST_DB: {
          type: "d1",
          name: target.database,
          id: "11111111-1111-4111-8111-111111111111",
        },
      },
    };
    const databaseId = "22222222-2222-4222-8222-222222222222";
    const deployed = bindDeploymentDatabase(artifact, target, databaseId);
    expect(deployed.manifest).toEqual(artifact.manifest);
    expect(deployed.env?.TABLECAST_DB).toMatchObject({ id: databaseId });
    expect(() => bindDeploymentDatabase(artifact, deploymentTarget(), databaseId)).toThrow(
      "別Worker",
    );
  });

  test("本番を生成するとGoogleに登録した単一originと非公開APIになる", () => {
    const target = deploymentTarget();
    const config = deploymentConfigs(
      target,
      "a".repeat(40),
      "11111111-1111-4111-8111-111111111111",
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
    for (const key of ["web", "api", "database", "bucket"] as const)
      expect(first[key]).not.toBe(second[key]);
    expect(firstSecrets.TABLECAST_GOOGLE_CLIENT_SECRET).toBeUndefined();
    expect(firstSecrets.TABLECAST_GOOGLE_CLIENT_ID).toBeUndefined();
    expect(firstSecrets.TABLECAST_MODEL_API_KEY).toBe(secondSecrets.TABLECAST_MODEL_API_KEY);
    expect(firstSecrets.TABLECAST_AUTH_SECRET).not.toBe(secondSecrets.TABLECAST_AUTH_SECRET);
    expect(deploymentSecrets(first, input).TABLECAST_AUTH_SECRET).toBe(
      firstSecrets.TABLECAST_AUTH_SECRET,
    );
  });

  test("PR設定を生成すると専用OAuthのContainerを1台を配備する", () => {
    const config = deploymentConfigs(
      deploymentTarget("34"),
      "a".repeat(40),
      "11111111-1111-4111-8111-111111111111",
    );
    expect(config.api.vars.TABLECAST_ENV).toBe("preview");
    expect(config.api.vars.TABLECAST_GOOGLE_AUTHORIZE_URL).toBe(
      "https://tablecast-pr-34.kit-codex.workers.dev/_tablecast/oauth",
    );
    expect(config.api.containers).toHaveLength(1);
    expect(config.api.triggers?.crons).toEqual(["*/5 * * * *"]);
    expect(
      JSON.parse(z.string().parse(config.api.vars.TABLECAST_CONTAINER_METRICS_APPLICATIONS)),
    ).toEqual(["tablecast-api-pr-34-tablecastemulate"]);
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
  // Given: 本文送信とpreviewのContainer収集に必要な監視資格。
  for (const key of [
    "TABLECAST_OTEL_AUTHORIZATION",
    ...(pr ? ["TABLECAST_CONTAINER_METRICS_TOKEN"] : []),
  ]) {
    // When / Then: Workerへの書込み前に不足した設定名で失敗する。
    expect(() => deploymentSecrets(deploymentTarget(pr), { ...input, [key]: undefined })).toThrow(
      key,
    );
  }
});

test("stagingは固定の資源と認証secretを保持しpreviewと同じ模擬認証を使う", () => {
  const target = deploymentTarget(undefined, "staging");
  const config = deploymentConfigs(target, "a".repeat(40), "11111111-1111-4111-8111-111111111111");
  expect(target.origin).toBe("https://tablecast-staging.kit-codex.workers.dev");
  expect(config.api.vars.TABLECAST_ENV).toBe("staging");
  expect(config.api.vars.TABLECAST_GOOGLE_AUTHORIZE_URL).toBe(`${target.origin}/_tablecast/oauth`);
  expect(config.api.containers).toHaveLength(1);
  const secrets = deploymentSecrets(target, {
    ...input,
    CF_ACCESS_CLIENT_ID: undefined,
    CF_ACCESS_CLIENT_SECRET: undefined,
  });
  expect(secrets).not.toHaveProperty("CF_ACCESS_CLIENT_ID");
  expect(secrets).not.toHaveProperty("CF_ACCESS_CLIENT_SECRET");
  expect(secrets).not.toHaveProperty("TABLECAST_GOOGLE_CLIENT_SECRET");
  expect(secrets).not.toHaveProperty("TABLECAST_BETTER_AUTH_API_KEY");
  expect(deploymentSecrets(deploymentTarget(undefined, "staging"), input)).toEqual(secrets);
  expect(secrets.TABLECAST_AUTH_SECRET).not.toBe(
    deploymentSecrets(deploymentTarget("189"), input).TABLECAST_AUTH_SECRET,
  );
  expect(() => deploymentTarget("189", "staging")).toThrow("配備環境とPR番号");
  expect(() => deploymentTarget(undefined, "preview")).toThrow("配備環境とPR番号");
  expect(() => deploymentTarget(undefined, "stagin")).toThrow("Invalid option");
});
