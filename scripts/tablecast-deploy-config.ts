import { createHmac } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";

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

// 公開stagingでOAuth discoveryの到達先を検査する。
export const stagingDiscoveryPaths = [
  "/.well-known/oauth-protected-resource/mcp",
  "/.well-known/oauth-authorization-server/api/auth",
  "/.well-known/openid-configuration/api/auth",
];

export function deploymentArtifact(
  input: unknown,
  target: DeploymentTarget,
  sha: string,
  databaseId: string,
) {
  // 同じCIの環境別成果物へ、配備時に確定したbindingだけを設定する。
  const config = z
    .looseObject({
      name: z.literal(target.api),
      main: z.string(),
      no_bundle: z.literal(true),
      vars: z.looseObject({
        TABLECAST_RELEASE_SHA: z.literal(sha),
        TABLECAST_ENV: z.literal(target.environment),
      }),
      d1_databases: z
        .array(
          z.looseObject({
            binding: z.literal("TABLECAST_DB"),
            database_name: z.literal(target.database),
            database_id: z.literal("11111111-1111-4111-8111-111111111111"),
          }),
        )
        .length(1),
      containers: z
        .array(
          z.looseObject({
            class_name: z.literal("TablecastEmulate"),
          }),
        )
        .length(target.emulate ? 1 : 0)
        .default([]),
    })
    .parse(input);
  return {
    ...config,
    d1_databases: config.d1_databases.map((binding) => ({
      ...binding,
      database_id: z.uuid().parse(databaseId),
    })),
    containers: config.containers.map((container) => ({
      ...container,
      image: `registry.cloudflare.com/${tablecastAccountId}/tablecast-emulate:${sha}`,
    })),
  };
}

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
  root: string,
  api: Record<string, unknown>,
  web: Record<string, unknown>,
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
  const apiConfig = {
    ...api,
    name: target.api,
    account_id: tablecastAccountId,
    main: resolve(root, "apps/api/src/worker.ts"),
    workers_dev: false,
    preview_urls: false,
    triggers: { crons: target.emulate ? ["*/5 * * * *"] : [] },
    vars: {
      ...telemetryVars,
      TABLECAST_CLOUDFLARE_ACCOUNT_ID: tablecastAccountId,
      TABLECAST_CONTAINER_METRICS_APPLICATIONS: JSON.stringify([
        ...(target.emulate ? [`${target.api}-tablecastemulate`] : []),
      ]),
      TABLECAST_PUBLIC_ORIGIN: target.origin,
      TABLECAST_VOICE_ENABLED: "true",
      ...(target.emulate
        ? {
            TABLECAST_GOOGLE_EMULATOR_URL: "http://tablecast-emulate",
            TABLECAST_GOOGLE_AUTHORIZE_URL: `${target.origin}/_tablecast/oauth`,
          }
        : {}),
    },
    d1_databases: [
      {
        binding: "TABLECAST_DB",
        database_name: target.database,
        database_id: databaseId,
        migrations_dir: resolve(root, "apps/api/migrations"),
      },
    ],
    r2_buckets: [{ binding: "TABLECAST_MEDIA", bucket_name: target.bucket }],
    containers: [
      ...(target.emulate
        ? [
            {
              class_name: "TablecastEmulate",
              image: resolve(root, "apps/emulate/Dockerfile"),
              image_build_context: root,
              instance_type: "basic",
              max_instances: 1,
            },
          ]
        : []),
    ],
  };
  return {
    api: apiConfig,
    web: {
      ...web,
      name: target.web,
      account_id: tablecastAccountId,
      main: resolve(root, "apps/web/src/server.ts"),
      workers_dev: true,
      preview_urls: false,
      services: [{ binding: "TABLECAST_API", service: target.api }],
      vars: telemetryVars,
    },
  };
}
