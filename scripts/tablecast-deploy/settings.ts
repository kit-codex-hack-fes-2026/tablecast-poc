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

export function billingDeploymentVars(environment: string) {
  const values =
    z
      .record(z.string(), z.record(z.string(), z.string()))
      .parse(JSON.parse(process.env.TABLECAST_BILLING_CONFIG || "{}"))[environment] ?? {};
  return Object.fromEntries(
    tablecastBillingVars.flatMap((key) => (values[key] === undefined ? [] : [[key, values[key]]])),
  );
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
                    ...(workspace === "api"
                      ? [
                          "TABLECAST_PUBLIC_ORIGIN",
                          "TABLECAST_GOOGLE_EMULATOR_URL",
                          "TABLECAST_GOOGLE_AUTHORIZE_URL",
                          "TABLECAST_MAILPIT_URL",
                          "TABLECAST_EMAIL_FROM",
                          "TABLECAST_VOICE_ENABLED",
                          ...tablecastBillingVars,
                          "TABLECAST_OTEL_CAPTURE_CONTENT",
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
    ...(hosted || voiceEnabled ? ["TABLECAST_MODEL_API_KEY", "TABLECAST_MODEL"] : []),
    ...(hosted ? ["TABLECAST_OTEL_AUTHORIZATION"] : []),
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
