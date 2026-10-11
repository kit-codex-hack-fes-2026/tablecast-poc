import {
  apiSdkConfiguration,
  sdkConfiguration,
  webCloudflareConfig,
} from "./tablecast-cloudflare-config";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { OutputWorkerSchema } from "@cloudflare/config";
import type { BuildOutput } from "@cloudflare/build-output-utils";

export const tablecastAccountId = "dbbd52d7d690afceea41fe920ae19f91";
export const tablecastRepository = "kit-codex-hack-fes-2026/tablecast-poc";

export function deploymentTarget(pr?: string, environment = pr ? "preview" : "production") {
  const mode = z.enum(["production", "staging", "preview"]).parse(environment);
  if ((mode === "preview") !== Boolean(pr)) throw new Error("配備環境とPR番号が一致しません。");
  if (pr !== undefined && !/^[1-9][0-9]{0,8}$/.test(pr)) throw new Error("PR番号が不正です。");
  const suffix = pr ? `-pr-${pr}` : mode === "staging" ? "-staging" : "";
  const web = `tablecast${suffix}`;
  return {
    pr,
    environment: mode,
    branch: mode === "production" ? "main" : mode === "staging" ? "staging" : undefined,
    emulate: mode !== "production",
    web,
    api: `tablecast-api${suffix}`,
    database: `tablecast-db${suffix}`,
    bucket: `tablecast-media${suffix}`,
    origin: `https://${web}.kit-codex.workers.dev`,
  };
}
export type DeploymentTarget = ReturnType<typeof deploymentTarget>;

export function deploymentBuildOutput(output: BuildOutput, target: DeploymentTarget, sha: string) {
  if (output.rootConfig.buildContext.mode !== target.environment)
    throw new Error("Build Outputのmodeが一致しません。");
  const workers = Object.values(output.workers);
  if (workers.length !== 2) throw new Error("Build OutputのWorker数が一致しません。");
  for (const name of [target.api, target.web]) {
    const worker = workers.find((candidate) => candidate.config.name === name);
    if (!worker?.bundleDir) throw new Error(`Worker成果物がありません: ${name}`);
    const secrets =
      name === target.api
        ? apiSdkConfiguration({ environment: target.environment }).secrets.required
        : ["TABLECAST_OTEL_AUTHORIZATION"];
    for (const secret of secrets)
      z.object({ type: z.literal("secret") }).parse(worker.config.env?.[secret]);
    z.object({
      TABLECAST_ENV: z.object({ type: z.literal("text"), value: z.literal(target.environment) }),
      TABLECAST_RELEASE_SHA: z.object({ type: z.literal("text"), value: z.literal(sha) }),
      TABLECAST_PR_NUMBER: z.object({ type: z.literal("text"), value: z.literal(target.pr ?? "") }),
    }).parse(worker.config.env);
    if (name === target.api) {
      z.object({
        TABLECAST_DB: z.object({
          type: z.literal("d1"),
          name: z.literal(target.database),
          id: z.literal("11111111-1111-4111-8111-111111111111"),
        }),
        TABLECAST_MEDIA: z.object({ type: z.literal("r2"), name: z.literal(target.bucket) }),
      }).parse(worker.config.env);
      z.object({
        StoreEvents: z.object({ type: z.literal("durable-object"), storage: z.literal("sqlite") }),
        TablecastEmulate: z.object({
          type: z.literal("durable-object"),
          storage: z.literal("sqlite"),
        }),
      }).parse(worker.config.exports);
    } else {
      z.object({
        TABLECAST_API: z.object({ type: z.literal("worker"), worker: z.literal(target.api) }),
      }).parse(worker.config.env);
    }
  }
  if (output.containers.length !== (target.emulate ? 1 : 0))
    throw new Error("Build OutputのContainer数が一致しません。");
  for (const container of output.containers)
    z.object({
      name: z.literal(`${target.api}-tablecastemulate`),
      image: z.object({
        reference: z.literal(
          `registry.cloudflare.com/${tablecastAccountId}/tablecast-emulate:${sha}`,
        ),
      }),
    }).parse(container.config);
  return workers;
}

export function bindDeploymentDatabase(
  input: unknown,
  target: DeploymentTarget,
  databaseId: string,
) {
  const config = OutputWorkerSchema.parse(input);
  if (config.name !== target.api) throw new Error("実D1を別Workerへ設定できません。");
  const database = z
    .object({
      type: z.literal("d1"),
      name: z.literal(target.database),
      id: z.literal("11111111-1111-4111-8111-111111111111"),
    })
    .parse(config.env?.TABLECAST_DB);
  return {
    ...config,
    env: { ...config.env, TABLECAST_DB: { ...database, id: z.uuid().parse(databaseId) } },
  };
}

// 公開stagingでOAuth discoveryの到達先を検査する。
export const stagingDiscoveryPaths = [
  "/.well-known/oauth-protected-resource/mcp",
  "/.well-known/oauth-authorization-server/api/auth",
  "/.well-known/openid-configuration/api/auth",
];

export function deploymentSecrets(
  target: DeploymentTarget,
  input: Record<string, string | undefined>,
) {
  const runtime = z
    .record(z.string(), z.string())
    .parse(JSON.parse(input.TABLECAST_RUNTIME_SECRETS ?? "{}"));
  const master = z.string().min(32).parse(input.TABLECAST_DEPLOY_SECRET);
  const derive = (purpose: string) =>
    createHmac("sha256", master).update(`${target.api}:${purpose}`).digest("hex");
  const required = (value: string | undefined, name: string) => {
    if (!value) throw new Error(`配備secretがありません: ${name}`);
    return value;
  };
  const secrets: Record<string, string> = {
    TABLECAST_OTEL_AUTHORIZATION: required(
      input.TABLECAST_OTEL_AUTHORIZATION,
      "TABLECAST_OTEL_AUTHORIZATION",
    ),
    TABLECAST_AUTH_SECRET: derive("auth"),
    TABLECAST_MODEL_API_KEY: required(runtime.TABLECAST_MODEL_API_KEY, "TABLECAST_MODEL_API_KEY"),
    TABLECAST_MODEL: required(input.TABLECAST_MODEL || runtime.TABLECAST_MODEL, "TABLECAST_MODEL"),
  };
  if (target.emulate) {
    secrets.TABLECAST_CONTAINER_METRICS_TOKEN = required(
      input.TABLECAST_CONTAINER_METRICS_TOKEN,
      "TABLECAST_CONTAINER_METRICS_TOKEN",
    );
  } else {
    secrets.TABLECAST_BETTER_AUTH_API_KEY = required(
      input.TABLECAST_BETTER_AUTH_API_KEY,
      "TABLECAST_BETTER_AUTH_API_KEY",
    );
    secrets.TABLECAST_GOOGLE_CLIENT_ID = required(
      input.TABLECAST_GOOGLE_CLIENT_ID,
      "TABLECAST_GOOGLE_CLIENT_ID",
    );
    secrets.TABLECAST_GOOGLE_CLIENT_SECRET = required(
      input.TABLECAST_GOOGLE_CLIENT_SECRET,
      "TABLECAST_GOOGLE_CLIENT_SECRET",
    );
  }
  if (target.environment === "preview") {
    secrets.CF_ACCESS_CLIENT_ID = required(input.CF_ACCESS_CLIENT_ID, "CF_ACCESS_CLIENT_ID");
    secrets.CF_ACCESS_CLIENT_SECRET = required(
      input.CF_ACCESS_CLIENT_SECRET,
      "CF_ACCESS_CLIENT_SECRET",
    );
  }
  return secrets;
}

export function deploymentConfigs(
  target: DeploymentTarget,
  sha: string,
  databaseId: string,
  captureContent = "true",
) {
  z.string()
    .regex(/^[a-f0-9]{40}$/)
    .parse(sha);
  z.uuid()
    .refine((value) => value !== "00000000-0000-0000-0000-000000000000")
    .parse(databaseId);
  const telemetryVars = {
    TABLECAST_ENV: target.environment,
    TABLECAST_RELEASE_SHA: sha,
    TABLECAST_PR_NUMBER: target.pr ?? "",
    TABLECAST_OTEL_CAPTURE_CONTENT: z.enum(["true", "false"]).parse(captureContent),
    TABLECAST_OTEL_ENDPOINT: "https://otlp-gateway-prod-ap-northeast-0.grafana.net/otlp",
  };
  const apiVars = {
    ...telemetryVars,
    TABLECAST_CLOUDFLARE_ACCOUNT_ID: tablecastAccountId,
    TABLECAST_CONTAINER_METRICS_APPLICATIONS: JSON.stringify(
      target.emulate ? [`${target.api}-tablecastemulate`] : [],
    ),
    TABLECAST_PUBLIC_ORIGIN: target.origin,
    TABLECAST_VOICE_ENABLED: "true",
    ...(target.emulate
      ? {
          TABLECAST_GOOGLE_EMULATOR_URL: "http://tablecast-emulate",
          TABLECAST_GOOGLE_AUTHORIZE_URL: `${target.origin}/_tablecast/oauth`,
        }
      : {}),
  };
  return {
    api: {
      ...apiSdkConfiguration({
        name: target.api,
        accountId: tablecastAccountId,
        environment: target.environment,
        database: { name: target.database, id: databaseId },
        bucket: target.bucket,
        vars: apiVars,
        containerImage: `registry.cloudflare.com/${tablecastAccountId}/tablecast-emulate:${sha}`,
      }),
      vars: apiVars,
    },
    web: {
      ...sdkConfiguration(
        webCloudflareConfig({
          name: target.web,
          accountId: tablecastAccountId,
          api: target.api,
          environment: target.environment,
          vars: telemetryVars,
        }),
      ),
      vars: telemetryVars,
    },
  };
}
