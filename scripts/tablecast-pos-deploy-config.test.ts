import { afterEach, describe, expect, test, vi } from "vitest";
import {
  deploymentOptions,
  deploymentSecrets,
  deploymentTarget,
} from "./tablecast-deploy-config.ts";
import { assertWorkerOwner } from "./tablecast-infra-diff.ts";

const input = {
  TABLECAST_CONTAINER_METRICS_TOKEN: "tablecast-metrics-secret",
  TABLECAST_OTEL_AUTHORIZATION: "tablecast-otel-secret",
  TABLECAST_RUNTIME_SECRETS: JSON.stringify({
    TABLECAST_MODEL_API_KEY: "tablecast-model-secret",
    TABLECAST_MODEL: "tablecast-test-model",
  }),
  TABLECAST_DEPLOY_SECRET: "tablecast-deployment-master-at-least-32-characters",
  CF_ACCESS_CLIENT_ID: "tablecast-access-id",
  CF_ACCESS_CLIENT_SECRET: "tablecast-access-secret",
};
const squareRuntime = {
  TABLECAST_SQUARE_WEBHOOK_SIGNATURE_KEY: "tablecast-square-signature-secret",
  TABLECAST_POS_ENCRYPTION_SECRET: "tablecast-square-encryption-at-least-32-characters",
};
afterEach(() => vi.unstubAllEnvs());

describe("固定Square Sandboxの所有境界", () => {
  test("対象PRが変わってもURL・DB・R2と認証鍵を維持する", () => {
    const first = deploymentTarget("436", "preview", true);
    const next = deploymentTarget("499", "preview", true);
    expect(first.origin).toBe("https://tablecast-square-sandbox.kit-codex.workers.dev");
    for (const key of ["origin", "web", "api", "database", "bucket"] as const)
      expect(next[key]).toBe(first[key]);
    expect(next.pr).toBe("499");
    expect(deploymentSecrets(first, input).TABLECAST_AUTH_SECRET).toBe(
      deploymentSecrets(next, input).TABLECAST_AUTH_SECRET,
    );
    expect(deploymentTarget("436").database).not.toBe(first.database);
  });

  test("固定Sandboxは通常PRとSandbox資格が揃う場合だけbuildできる", () => {
    expect(() => deploymentTarget(undefined, "production", true)).toThrow("通常PRの検証にだけ");
    expect(() => deploymentTarget(undefined, "staging", true)).toThrow("通常PRの検証にだけ");
    vi.stubEnv("TABLECAST_SQUARE_ENVIRONMENT", "production");
    vi.stubEnv("TABLECAST_SQUARE_APPLICATION_ID", "sq0idp-tablecast-test");
    const target = deploymentTarget("436", "preview", true);
    const build = () =>
      deploymentOptions(target, "a".repeat(40), "11111111-1111-4111-8111-111111111111");
    expect(build).toThrow("Sandboxアプリの設定が必要");
    vi.stubEnv("TABLECAST_SQUARE_ENVIRONMENT", "sandbox");
    vi.stubEnv("TABLECAST_SQUARE_APPLICATION_ID", "sandbox-sq0idb-tablecast-test");
    const result = build();
    expect(result.api.vars.TABLECAST_PUBLIC_ORIGIN).toBe(target.origin);
    expect(result.web.vars.TABLECAST_PR_NUMBER).toBe("436");
  });

  test("固定環境の次PRを受け入れても別origin・本番接続・別DBへの書換えを拒否する", () => {
    const target = deploymentTarget("499", "preview", true);
    const databaseId = "11111111-1111-4111-8111-111111111111";
    const bindings = [
      { name: "TABLECAST_ENV", type: "plain_text", text: "preview" },
      { name: "TABLECAST_PR_NUMBER", type: "plain_text", text: "436" },
      { name: "TABLECAST_PUBLIC_ORIGIN", type: "plain_text", text: target.origin },
      { name: "TABLECAST_SQUARE_ENVIRONMENT", type: "plain_text", text: "sandbox" },
      { name: "TABLECAST_DB", type: "d1", id: databaseId },
    ];
    expect(() => assertWorkerOwner({ bindings }, target, true, databaseId)).not.toThrow();
    for (const name of ["TABLECAST_PUBLIC_ORIGIN", "TABLECAST_SQUARE_ENVIRONMENT"]) {
      const changed = bindings.map((binding) =>
        binding.name === name ? { ...binding, text: "production" } : binding,
      );
      expect(() => assertWorkerOwner({ bindings: changed }, target, true, databaseId)).toThrow(
        "所有環境",
      );
    }
    expect(() => assertWorkerOwner({ bindings }, target, true, "different-database")).toThrow(
      "別のD1",
    );
    expect(() =>
      assertWorkerOwner({ bindings }, deploymentTarget("499"), true, databaseId),
    ).toThrow("PR番号");
  });
  test("固定WebはsourcePRが変わっても同じAPI bindingだけを再採用する", () => {
    const target = deploymentTarget("499", "preview", true);
    const bindings = [
      { name: "TABLECAST_ENV", type: "plain_text", text: "preview" },
      { name: "TABLECAST_PR_NUMBER", type: "plain_text", text: "436" },
      { name: "TABLECAST_API", type: "service", service: target.api },
    ];
    expect(() => assertWorkerOwner({ bindings }, target, false)).not.toThrow();
    bindings[2] = { name: "TABLECAST_API", type: "service", service: "tablecast-api-pr-499" };
    expect(() => assertWorkerOwner({ bindings }, target, false)).toThrow("所有環境");
  });
});

describe("固定Square Sandboxの秘密情報", () => {
  test("既存runtime JSONが不正でも秘密値の断片を例外へ出さない", () => {
    expect(() =>
      deploymentSecrets(deploymentTarget("436"), {
        ...input,
        TABLECAST_RUNTIME_SECRETS: "sandbox-sq0csb-tablecast-private-do-not-log",
      }),
    ).toThrow("TABLECAST_RUNTIME_SECRETSには正しいJSONを設定してください。");
  });

  test("専用secretは既存runtimeと認証鍵を保持してSquareの3項目だけを追加する", () => {
    const target = deploymentTarget("436", "preview", true);
    const baseline = deploymentSecrets(target, input);
    const secrets = deploymentSecrets(target, {
      ...input,
      ...squareRuntime,
      TABLECAST_SQUARE_ENVIRONMENT: "sandbox",
      TABLECAST_SQUARE_APPLICATION_ID: "sandbox-sq0idb-tablecast-test",
      TABLECAST_SQUARE_APPLICATION_SECRET: "sandbox-sq0csb-tablecast-test",
      TABLECAST_MODEL_API_KEY: "tablecast-must-not-replace",
    });
    expect(secrets).toMatchObject(baseline);
    expect(secrets.TABLECAST_SQUARE_APPLICATION_SECRET).toBe("sandbox-sq0csb-tablecast-test");
    expect(secrets.TABLECAST_SQUARE_WEBHOOK_SIGNATURE_KEY).toBe(
      squareRuntime.TABLECAST_SQUARE_WEBHOOK_SIGNATURE_KEY,
    );
  });

  test.each([
    { target: deploymentTarget(), environment: "sandbox" },
    { target: deploymentTarget(undefined, "staging"), environment: "sandbox" },
    { target: deploymentTarget("436"), environment: "sandbox" },
    { target: deploymentTarget("436", "preview", true), environment: "production" },
  ])("専用secretを$target.environment/$environmentへ持ち込まない", ({ target, environment }) => {
    expect(() =>
      deploymentSecrets(target, {
        ...input,
        TABLECAST_SQUARE_ENVIRONMENT: environment,
        TABLECAST_SQUARE_APPLICATION_SECRET: "sandbox-sq0csb-tablecast-test",
      }),
    ).toThrow("固定Sandboxだけ");
  });
});
