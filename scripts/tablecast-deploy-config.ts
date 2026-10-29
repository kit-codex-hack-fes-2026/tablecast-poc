import { type BuildOutput } from "@cloudflare/build-output-utils";
import { OutputWorkerSchema } from "@cloudflare/config";
import { createHmac } from "node:crypto";
import { z } from "zod";

export const tablecastAccountId = "dbbd52d7d690afceea41fe920ae19f91";

export const tablecastRepository = "kit-codex-hack-fes-2026/tablecast-poc";

export const tablecastBillingVars = [
  "TABLECAST_ORGANIZATION_AI_ENABLED",
  "TABLECAST_OPENAI_PROJECT_ID",
  "TABLECAST_BILLING_ENABLED",
  "TABLECAST_BILLING_RATES",
  "TABLECAST_BILLING_OPERATOR_USER_IDS",
];

export const tablecastBillingSecrets = [
  "TABLECAST_OPENAI_ADMIN_API_KEY",
  "TABLECAST_OPENAI_KEY_ENCRYPTION_SECRET",
  "TABLECAST_STRIPE_SECRET_KEY",
  "TABLECAST_STRIPE_WEBHOOK_SECRET",
];

export const tablecastPosSecrets = [
  "TABLECAST_SQUARE_APPLICATION_SECRET",
  "TABLECAST_SQUARE_WEBHOOK_SIGNATURE_KEY",
  "TABLECAST_POS_ENCRYPTION_SECRET",
];

export const tablecastPosVars = ["TABLECAST_SQUARE_APPLICATION_ID", "TABLECAST_SQUARE_ENVIRONMENT"];

export function tablecastSquareVars(input: Record<string, string | undefined> = process.env) {
  const environment = z
    .enum(["production", "sandbox"], {
      error: "TABLECAST_SQUARE_ENVIRONMENTはproductionまたはsandboxを指定してください。",
    })
    .parse(input.TABLECAST_SQUARE_ENVIRONMENT ?? "production");
  const applicationId = input.TABLECAST_SQUARE_APPLICATION_ID ?? "";
  if (
    applicationId &&
    !(environment === "sandbox" ? /^sandbox-sq0id[pb]-/ : /^sq0id[pb]-/).test(applicationId)
  )
    throw new Error("TABLECAST_SQUARE_APPLICATION_IDがSquare接続環境と一致しません。");
  return {
    TABLECAST_SQUARE_APPLICATION_ID: applicationId,
    TABLECAST_SQUARE_ENVIRONMENT: environment,
  };
}

function billingDeploymentVars(environment: string) {
  const values =
    z
      .record(z.string(), z.record(z.string(), z.string()))
      .parse(JSON.parse(process.env.TABLECAST_BILLING_CONFIG || "{}"))[environment] ?? {};
  return Object.fromEntries(
    tablecastBillingVars.flatMap((key) => (values[key] === undefined ? [] : [[key, values[key]]])),
  );
}

function emailDeploymentFrom(environment: string) {
  const from = process.env.TABLECAST_EMAIL_FROM;
  if (!from && environment !== "production") return "";
  return z.email({ error: "TABLECAST_EMAIL_FROMに確認済み送信元を設定してください。" }).parse(from);
}

export const tablecastCompatibilityDate = "2026-09-03";

export const optionsSchema = z.object({
  name: z.string().default("tablecast-api"),
  accountId: z.string().optional(),
  vars: z.record(z.string(), z.string()).default({}),
  database: z.object({ name: z.string(), id: z.uuid() }).default({
    name: "tablecast-local",
    id: "00000000-0000-4000-8000-000000000000",
  }),
  bucket: z.string().default("tablecast-media"),
  api: z.string().default("tablecast-api"),
  environment: z
    .enum(["development", "test", "preview", "staging", "production"])
    .default("development"),
  containerImage: z.string().optional(),
});

export type TablecastConfigOptions = z.input<typeof optionsSchema>;

export function modeOptions(
  workspace: "api" | "web",
  mode: string | undefined,
  input = process.env.TABLECAST_CONFIG,
  localEnv: Record<string, string | undefined> = process.env,
) {
  const options = input
    ? z.object({ api: optionsSchema, web: optionsSchema }).parse(JSON.parse(input))[workspace]
    : optionsSchema.parse(
        localEnv.TABLECAST_RESOURCE_NAME
          ? {
              name: `tablecast-${localEnv.TABLECAST_RESOURCE_NAME}-${workspace}`,
              api: `tablecast-${localEnv.TABLECAST_RESOURCE_NAME}-api`,
              database: {
                name: `tablecast-${localEnv.TABLECAST_RESOURCE_NAME}`,
                id: "00000000-0000-4000-8000-000000000000",
              },
              bucket: `tablecast-${localEnv.TABLECAST_RESOURCE_NAME}-media`,
              vars: {
                TABLECAST_ENV: "development",
                ...Object.fromEntries(
                  [
                    "TABLECAST_RELEASE_SHA",
                    "TABLECAST_OTEL_ENDPOINT",
                    "TABLECAST_WORKTREE_ID",
                    "TABLECAST_WORKTREE_NAME",
                    ...(workspace === "api"
                      ? [
                          "TABLECAST_PUBLIC_ORIGIN",
                          "TABLECAST_GOOGLE_EMULATOR_URL",
                          "TABLECAST_GOOGLE_AUTHORIZE_URL",
                          "TABLECAST_MAILPIT_URL",
                          "TABLECAST_EMAIL_FROM",
                          "TABLECAST_VOICE_ENABLED",
                          ...tablecastPosVars,
                          ...tablecastBillingVars,
                          "TABLECAST_OTEL_CAPTURE_CONTENT",
                          "TABLECAST_LANGFUSE_BASE_URL",
                        ]
                      : []),
                  ].flatMap((key) => (localEnv[key] === undefined ? [] : [[key, localEnv[key]]])),
                ),
              },
            }
          : { name: `tablecast-${workspace}` },
      );
  const environment = optionsSchema.shape.environment.parse(mode ?? options.environment);
  if (input && environment !== options.environment)
    throw new Error("設定の環境とcf modeが一致しません。");
  if (!input && ["preview", "staging", "production"].includes(environment))
    throw new Error("配備設定をbuild:deployで生成してください。");
  return { ...options, environment };
}

export function requiredApiSecrets(
  environment: string,
  voiceEnabled = false,
  vars: Record<string, string> = {},
) {
  const hosted = ["preview", "staging", "production"].includes(environment);
  return [
    "TABLECAST_AUTH_SECRET",
    ...(vars.TABLECAST_OPENAI_PROJECT_ID ? tablecastBillingSecrets.slice(0, 2) : []),
    ...(vars.TABLECAST_BILLING_ENABLED === "true" ? tablecastBillingSecrets.slice(2) : []),
    ...(vars.TABLECAST_SQUARE_APPLICATION_ID ? tablecastPosSecrets : []),
    ...(hosted || voiceEnabled ? ["TABLECAST_MODEL_API_KEY", "TABLECAST_MODEL"] : []),
    ...(hosted ? ["TABLECAST_OTEL_AUTHORIZATION"] : []),
    ...(["preview", "staging"].includes(environment) && vars.TABLECAST_LANGFUSE_BASE_URL
      ? ["TABLECAST_LANGFUSE_PUBLIC_KEY", "TABLECAST_LANGFUSE_SECRET_KEY"]
      : []),
    ...(["preview", "staging"].includes(environment) ? ["TABLECAST_CONTAINER_METRICS_TOKEN"] : []),
    ...(environment === "preview" ? ["CF_ACCESS_CLIENT_ID", "CF_ACCESS_CLIENT_SECRET"] : []),
    ...(environment === "production"
      ? [
          "TABLECAST_GOOGLE_CLIENT_ID",
          "TABLECAST_GOOGLE_CLIENT_SECRET",
          "TABLECAST_BETTER_AUTH_API_KEY",
        ]
      : []),
  ];
}

// 2026-10-11にD1一覧・DO一覧とSQLite storageを照合した常設資源。
export const tablecastAdoptedResources = {
  production: {
    database: "6cc5c833-9c01-4172-92e7-18d713db9a8f",
    namespaces: {
      StoreEvents: "2d4e84834bfc4d41be6093d4e5242d8c",
      TablecastEmulate: "4bb365dc1db448d9a38480381e06508f",
    },
  },
  staging: {
    database: "0af58c70-6818-4e94-a23d-976993d321c4",
    namespaces: {
      StoreEvents: "2c60391b44404f5280829a980bcaf795",
      TablecastEmulate: "238f0efa5ad349a7bceffc8ab1cb158c",
    },
  },
};

// 2026-10-11に現物を照合した既存ID。service tokenの秘密値・期限を再生成しない。
export const tablecastAccess = {
  serviceToken: {
    id: "7ac8f0a6-6fbe-45a0-b1e1-3c3b495e5e6d",
    name: "tablecast-preview-service",
    duration: "8760h",
  },
  policies: [
    {
      id: "7abce02a-37b7-43df-94e3-ba95360ea74f",
      name: "tablecast-preview-members",
      decision: "allow",
      include: [{ cloudflare_account_member: { account_id: tablecastAccountId } }],
      require: [],
      exclude: [],
    },
    {
      id: "53f813e1-8d09-4588-a513-fcc40856b3be",
      name: "tablecast-preview-service",
      decision: "non_identity",
      include: [{ service_token: { token_id: "7ac8f0a6-6fbe-45a0-b1e1-3c3b495e5e6d" } }],
      require: [],
      exclude: [],
    },
  ],
} as const;

export function accessApplicationConfig(name: string, domain: string, workerId?: string) {
  return {
    name,
    type: "self_hosted",
    session_duration: "24h",
    ...(workerId ? { destinations: [{ type: "worker", worker_id: workerId }] } : { domain }),
    policies: tablecastAccess.policies.map((policy, index) => ({
      id: policy.id,
      precedence: index + 1,
    })),
  };
}

// 公開stagingでOAuth discoveryの到達先を検査する。
export const stagingDiscoveryPaths = [
  "/.well-known/oauth-protected-resource/mcp",
  "/.well-known/oauth-authorization-server/api/auth",
  "/.well-known/openid-configuration/api/auth",
];

export function deploymentTarget(
  pr?: string,
  environment = pr ? "preview" : "production",
  squareSandbox = false,
) {
  const mode = z.enum(["production", "staging", "preview"]).parse(environment);
  if ((mode === "preview") !== Boolean(pr)) throw new Error("配備環境とPR番号が一致しません。");
  if (pr !== undefined && !/^[1-9][0-9]{0,8}$/.test(pr)) throw new Error("PR番号が不正です。");
  if (squareSandbox && mode !== "preview")
    throw new Error("固定Square Sandboxは通常PRの検証にだけ使えます。");
  const suffix = squareSandbox
    ? "-square-sandbox"
    : pr
      ? `-pr-${pr}`
      : mode === "staging"
        ? "-staging"
        : "";
  const web = `tablecast${suffix}`;
  return {
    pr,
    squareSandbox,
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

export function deploymentOptions(
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
  const billingVars = billingDeploymentVars(target.environment);
  const square = tablecastSquareVars();
  if (
    target.squareSandbox &&
    (square.TABLECAST_SQUARE_ENVIRONMENT !== "sandbox" || !square.TABLECAST_SQUARE_APPLICATION_ID)
  )
    throw new Error("固定Square SandboxにはSandboxアプリの設定が必要です。");
  const apiVars = {
    ...Object.fromEntries(
      tablecastBillingVars.flatMap((key) =>
        billingVars[key] === undefined ? [] : [[key, billingVars[key]]],
      ),
    ),
    ...telemetryVars,
    TABLECAST_CLOUDFLARE_ACCOUNT_ID: tablecastAccountId,
    TABLECAST_CONTAINER_METRICS_APPLICATIONS: JSON.stringify(
      target.emulate ? [`${target.api}-tablecastemulate`] : [],
    ),
    TABLECAST_PUBLIC_ORIGIN: target.origin,
    TABLECAST_EMAIL_FROM: emailDeploymentFrom(target.environment),
    ...square,
    TABLECAST_VOICE_ENABLED: "true",
    ...(["preview", "staging"].includes(target.environment) &&
    process.env.TABLECAST_LANGFUSE_PUBLIC_KEY
      ? { TABLECAST_LANGFUSE_BASE_URL: "https://jp.cloud.langfuse.com" }
      : {}),
    ...(target.emulate
      ? {
          TABLECAST_GOOGLE_EMULATOR_URL: "http://tablecast-emulate",
          TABLECAST_GOOGLE_AUTHORIZE_URL: `${target.origin}/_tablecast/oauth`,
        }
      : {}),
  };
  return {
    api: {
      name: target.api,
      accountId: tablecastAccountId,
      environment: target.environment,
      database: { name: target.database, id: databaseId },
      bucket: target.bucket,
      vars: apiVars,
      containerImage: `registry.cloudflare.com/${tablecastAccountId}/tablecast-emulate:${sha}`,
    },
    web: {
      name: target.web,
      accountId: tablecastAccountId,
      api: target.api,
      environment: target.environment,
      vars: telemetryVars,
    },
  };
}

export function deploymentSecrets(
  target: DeploymentTarget,
  input: Record<string, string | undefined>,
) {
  const secretJson = (name: string): unknown => {
    try {
      return JSON.parse(input[name] ?? "{}");
    } catch {
      throw new Error(`${name}には正しいJSONを設定してください。`);
    }
  };
  const runtime = z.record(z.string(), z.string()).parse(secretJson("TABLECAST_RUNTIME_SECRETS"));
  const squareOverrides: Record<string, string> = {};
  for (const key of tablecastPosSecrets) {
    if (input[key]) squareOverrides[key] = input[key];
  }
  if (Object.keys(squareOverrides).length) {
    if (!target.squareSandbox || input.TABLECAST_SQUARE_ENVIRONMENT !== "sandbox")
      throw new Error("Square専用secretの追加は固定Sandboxだけで使えます。");
    Object.assign(runtime, squareOverrides);
  }
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
  const square = tablecastSquareVars(input);
  const enabledSecrets = requiredApiSecrets(target.environment, true, {
    ...billingDeploymentVars(target.environment),
    ...square,
  });
  for (const key of [...tablecastBillingSecrets, ...tablecastPosSecrets]) {
    if (!enabledSecrets.includes(key)) continue;
    const value = required(runtime[key], key);
    if (
      key === "TABLECAST_SQUARE_APPLICATION_SECRET" &&
      !(
        square.TABLECAST_SQUARE_ENVIRONMENT === "sandbox" ? /^sandbox-sq0cs[pb]-/ : /^sq0cs[pb]-/
      ).test(value)
    )
      throw new Error("TABLECAST_SQUARE_APPLICATION_SECRETがSquare接続環境と一致しません。");
    if (key === "TABLECAST_POS_ENCRYPTION_SECRET" && value.length < 32)
      throw new Error("TABLECAST_POS_ENCRYPTION_SECRETは32文字以上にしてください。");
    secrets[key] = value;
  }
  if (target.emulate && input.TABLECAST_LANGFUSE_PUBLIC_KEY) {
    secrets.TABLECAST_LANGFUSE_PUBLIC_KEY = input.TABLECAST_LANGFUSE_PUBLIC_KEY;
    secrets.TABLECAST_LANGFUSE_SECRET_KEY = required(
      input.TABLECAST_LANGFUSE_SECRET_KEY,
      "TABLECAST_LANGFUSE_SECRET_KEY",
    );
  }
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
        ? requiredApiSecrets(target.environment, true, {
            ...billingDeploymentVars(target.environment),
            ...tablecastSquareVars(),
          })
        : ["TABLECAST_OTEL_AUTHORIZATION"];
    for (const secret of secrets)
      z.object({ type: z.literal("secret") }).parse(worker.config.env?.[secret]);
    z.object({
      TABLECAST_ENV: z.object({ type: z.literal("text"), value: z.literal(target.environment) }),
      TABLECAST_RELEASE_SHA: z.object({ type: z.literal("text"), value: z.literal(sha) }),
      TABLECAST_PR_NUMBER: z.object({ type: z.literal("text"), value: z.literal(target.pr ?? "") }),
    }).parse(worker.config.env);
    if (name === target.api) {
      const from = emailDeploymentFrom(target.environment);
      z.object({
        TABLECAST_EMAIL_FROM: z.object({ type: z.literal("text"), value: z.literal(from) }),
        TABLECAST_EMAIL: z.object({
          type: z.literal("send-email"),
          allowedSenderAddresses: from ? z.tuple([z.literal(from)]) : z.undefined().optional(),
        }),
      }).parse(worker.config.env);
      for (const key of tablecastBillingVars) {
        const expected =
          billingDeploymentVars(target.environment)[key] ??
          (key.endsWith("_ENABLED") ? "false" : "");
        const binding = worker.config.env?.[key];
        if (binding?.type !== "text" || binding.value !== expected)
          throw new Error("課金設定がbuild成果物と異なります。設定を揃えて再buildしてください。");
      }
      for (const [key, value] of Object.entries(tablecastSquareVars())) {
        const binding = worker.config.env?.[key];
        if (binding?.type !== "text" || binding.value !== value)
          throw new Error("Square設定がbuild成果物と異なります。設定を揃えて再buildしてください。");
      }
      z.object({
        TABLECAST_DB: z.object({
          type: z.literal("d1"),
          name: z.literal(target.database),
          id: z.literal("11111111-1111-4111-8111-111111111111"),
        }),
        TABLECAST_MEDIA: z.object({ type: z.literal("r2"), name: z.literal(target.bucket) }),
      }).parse(worker.config.env);
      z.object({
        TablecastVoiceUsage: z.object({
          type: z.literal("durable-object"),
          storage: z.literal("sqlite"),
        }),
        StoreEvents: z.object({ type: z.literal("durable-object"), storage: z.literal("sqlite") }),
        TablecastEmulate: z.object({
          type: z.literal("durable-object"),
          storage: z.literal("sqlite"),
        }),
      }).parse(worker.config.exports);
    } else {
      if ([...tablecastPosVars, ...tablecastPosSecrets].some((key) => worker.config.env?.[key]))
        throw new Error("Square設定をWeb Workerへ渡せません。");
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
