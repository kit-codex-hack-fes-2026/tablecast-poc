import { createHmac } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";

export const tablecastAccountId = "dbbd52d7d690afceea41fe920ae19f91";
export const tablecastRepository = "kit-codex-hack-fes-2026/tablecast-poc";

export function deploymentTarget(pr?: string) {
  if (pr !== undefined && !/^[1-9][0-9]{0,8}$/.test(pr)) throw new Error("PR番号が不正です。");
  const suffix = pr ? `-pr-${pr}` : "";
  const web = `tablecast${suffix}`;
  return {
    pr,
    environment: pr ? "preview" : "production",
    web,
    api: `tablecast-api${suffix}`,
    database: `tablecast-db${suffix}`,
    bucket: `tablecast-media${suffix}`,
    agent: `tablecast-voice${suffix}`,
    origin: `https://${web}.kit-codex.workers.dev`,
  };
}
export type DeploymentTarget = ReturnType<typeof deploymentTarget>;

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
      vars: z.looseObject({ TABLECAST_RELEASE_SHA: z.literal(sha) }),
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
            class_name: z.enum(
              target.pr ? ["TablecastVoice", "TablecastEmulate"] : ["TablecastVoice"],
            ),
          }),
        )
        .length(target.pr ? 2 : 1),
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
      image: `registry.cloudflare.com/${tablecastAccountId}/tablecast-${container.class_name === "TablecastVoice" ? "voice" : "emulate"}:${sha}`,
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
    TABLECAST_AUTH_SECRET: derive("auth"),
    TABLECAST_VOICE_API_TOKEN: derive("voice"),
    TABLECAST_LIVEKIT_URL: required(runtime.LIVEKIT_URL, "LIVEKIT_URL"),
    TABLECAST_LIVEKIT_API_KEY: required(runtime.LIVEKIT_API_KEY, "LIVEKIT_API_KEY"),
    TABLECAST_LIVEKIT_API_SECRET: required(runtime.LIVEKIT_API_SECRET, "LIVEKIT_API_SECRET"),
    OPENAI_API_KEY: required(runtime.OPENAI_API_KEY, "OPENAI_API_KEY"),
    INWORLD_API_KEY: required(runtime.INWORLD_API_KEY, "INWORLD_API_KEY"),
    TABLECAST_MODEL_API_KEY: required(
      runtime.TABLECAST_MODEL_API_KEY ?? runtime.OPENAI_API_KEY,
      "TABLECAST_MODEL_API_KEY",
    ),
    TABLECAST_MODEL: required(runtime.TABLECAST_MODEL, "TABLECAST_MODEL"),
    TABLECAST_INWORLD_VOICES_API_KEY: required(
      runtime.TABLECAST_INWORLD_VOICES_API_KEY ?? runtime.INWORLD_API_KEY,
      "TABLECAST_INWORLD_VOICES_API_KEY",
    ),
  };
  for (const key of [
    "TABLECAST_MASTRA_ACCESS_TOKEN",
    "TABLECAST_MASTRA_PROJECT_ID",
    "TABLECAST_MASTRA_ENDPOINT",
    "TABLECAST_CONTAINER_METRICS_TOKEN",
  ]) {
    if (input[key]) secrets[key] = input[key];
  }
  if (input.TABLECAST_OTEL_AUTHORIZATION) {
    secrets.TABLECAST_OTEL_AUTHORIZATION = input.TABLECAST_OTEL_AUTHORIZATION;
  }
  if (target.pr) {
    secrets.CF_ACCESS_CLIENT_ID = required(input.CF_ACCESS_CLIENT_ID, "CF_ACCESS_CLIENT_ID");
    secrets.CF_ACCESS_CLIENT_SECRET = required(
      input.CF_ACCESS_CLIENT_SECRET,
      "CF_ACCESS_CLIENT_SECRET",
    );
  } else {
    secrets.TABLECAST_GOOGLE_CLIENT_ID = required(
      input.TABLECAST_GOOGLE_CLIENT_ID,
      "TABLECAST_GOOGLE_CLIENT_ID",
    );
    secrets.TABLECAST_GOOGLE_CLIENT_SECRET = required(
      input.TABLECAST_GOOGLE_CLIENT_SECRET,
      "TABLECAST_GOOGLE_CLIENT_SECRET",
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
    triggers: { crons: ["*/5 * * * *"] },
    vars: {
      ...telemetryVars,
      TABLECAST_CLOUDFLARE_ACCOUNT_ID: tablecastAccountId,
      TABLECAST_CONTAINER_METRICS_APPLICATIONS: JSON.stringify([
        `${target.api}-tablecastvoice`,
        ...(target.pr ? [`${target.api}-tablecastemulate`] : []),
      ]),
      TABLECAST_PUBLIC_ORIGIN: target.origin,
      TABLECAST_CONTAINERS_ENABLED: "true",
      TABLECAST_VOICE_ENABLED: "true",
      TABLECAST_AGENT_NAME: target.agent,
      ...(target.pr
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
      {
        class_name: "TablecastVoice",
        image: resolve(root, "livekit/Dockerfile"),
        instance_type: "standard-1",
        max_instances: 1,
      },
      ...(target.pr
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
