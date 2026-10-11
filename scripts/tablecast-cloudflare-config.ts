import { bindings, defineConfig, defineContainer, exports, triggers } from "cf/config";
import { convertToWranglerConfig, InputConfigSchema } from "@cloudflare/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

export const tablecastCompatibilityDate = "2026-09-03";
const root = resolve(import.meta.dirname, "..");
const optionsSchema = z.object({
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

export function configurationOptions(path: string | undefined) {
  if (!path) return optionsSchema.parse({});
  const generated = z
    .object({
      name: z.string(),
      account_id: z.string().optional(),
      vars: z.record(z.string(), z.string()).default({}),
      d1_databases: z
        .array(z.object({ database_name: z.string(), database_id: z.uuid() }))
        .optional(),
      r2_buckets: z.array(z.object({ bucket_name: z.string() })).optional(),
      services: z.array(z.object({ service: z.string() })).optional(),
      containers: z.array(z.object({ image: z.string() })).optional(),
    })
    .parse(JSON.parse(readFileSync(path, "utf8")));
  return optionsSchema.parse({
    name: generated.name,
    accountId: generated.account_id,
    vars: generated.vars,
    environment: generated.vars.TABLECAST_ENV ?? "development",
    database: generated.d1_databases?.[0]
      ? { name: generated.d1_databases[0].database_name, id: generated.d1_databases[0].database_id }
      : undefined,
    bucket: generated.r2_buckets?.[0]?.bucket_name,
    api: generated.services?.[0]?.service,
    containerImage: generated.containers?.[0]?.image,
  });
}

export function modeOptions(path: string | undefined, mode: string | undefined) {
  const options = configurationOptions(path);
  const environment = optionsSchema.shape.environment.parse(mode ?? options.environment);
  if (path && environment !== options.environment)
    throw new Error("設定の環境とcf modeが一致しません。");
  if (!path && ["preview", "staging", "production"].includes(environment))
    throw new Error("配備設定をbuild:deployで生成してください。");
  return { ...options, environment };
}

export function apiSdkConfiguration(input: TablecastConfigOptions = {}) {
  const authored = apiCloudflareConfig(input);
  const config = convertToWranglerConfig(
    InputConfigSchema.parse({
      ...authored,
      worker: {
        ...authored.worker,
        exports: {
          ...authored.worker.exports,
          TablecastEmulate: {
            type: "durable-object",
            storage: "sqlite",
            ...(authored.containers[0] ? { container: authored.containers[0].name } : {}),
          },
        },
      },
    }),
  );
  return {
    ...config,
    secrets: {
      required: config.secrets?.required?.filter((name) => input.vars?.[name] === undefined) ?? [],
    },
    d1_databases:
      config.d1_databases?.map((database) => ({
        ...database,
        migrations_dir: resolve(root, "apps/api/migrations"),
      })) ?? [],
    r2_buckets: config.r2_buckets ?? [],
    // 公式converterはself bindingにもscript_nameを出す。SDKの単独storage接続ではselfへ統一する。
    durable_objects: {
      bindings:
        config.durable_objects?.bindings?.map(({ script_name: _script, ...binding }) => binding) ??
        [],
    },
    vars: config.vars ?? {},
    containers: config.containers ?? [],
  };
}

export function apiCloudflareConfig(input: TablecastConfigOptions = {}) {
  const options = optionsSchema.parse(input);
  const hosted = ["preview", "staging", "production"].includes(options.environment);
  const emulate = options.environment === "preview" || options.environment === "staging";
  const container = emulate
    ? defineContainer({
        name: `${options.name}-tablecastemulate`,
        image: {
          reference:
            options.containerImage ??
            `registry.cloudflare.com/${options.accountId}/tablecast-emulate:${options.vars.TABLECAST_RELEASE_SHA}`,
        },
        instanceType: "basic",
        maxInstances: 1,
      })
    : undefined;
  return defineConfig({
    ...(options.accountId ? { accountId: options.accountId } : {}),
    worker: {
      name: options.name,
      entrypoint: resolve(root, "apps/api/src/worker.ts"),
      compatibilityDate: tablecastCompatibilityDate,
      compatibilityFlags: ["nodejs_compat", "nodejs_compat_do_not_populate_process_env"],
      workersDev: false,
      previewUrls: false,
      placement: { mode: "smart" },
      observability: { enabled: true, headSamplingRate: 1 },
      triggers: emulate ? [triggers.scheduled({ schedule: "*/5 * * * *" })] : [],
      exports: {
        StoreEvents: exports.durableObject({ storage: "sqlite" }),
        TablecastEmulate: exports.durableObject({
          storage: "sqlite",
          ...(container ? { container } : {}),
        }),
      },
      env: {
        TABLECAST_PUBLIC_ORIGIN: bindings.text(
          options.vars.TABLECAST_PUBLIC_ORIGIN ?? "http://localhost:3000",
        ),
        TABLECAST_ENV: bindings.text(options.environment),
        TABLECAST_RELEASE_SHA: bindings.text(options.vars.TABLECAST_RELEASE_SHA ?? "local"),
        TABLECAST_VOICE_ENABLED: bindings.text(hosted ? "true" : "false"),
        ...Object.fromEntries(
          Object.entries(options.vars).map(([key, value]) => [key, bindings.text(value)]),
        ),
        TABLECAST_DB: bindings.d1(options.database),
        TABLECAST_MEDIA: bindings.r2({ name: options.bucket }),
        TABLECAST_IMAGES: bindings.images(),
        TABLECAST_EMAIL: bindings.sendEmail(),
        TABLECAST_EVENTS: bindings.durableObject({
          worker: options.name,
          exportName: "StoreEvents",
        }),
        TABLECAST_EMULATE: bindings.durableObject({
          worker: options.name,
          exportName: "TablecastEmulate",
        }),
        TABLECAST_AUTH_SECRET: bindings.secret(),
        ...(hosted || options.vars.TABLECAST_VOICE_ENABLED === "true"
          ? {
              TABLECAST_MODEL_API_KEY: bindings.secret(),
              TABLECAST_MODEL: bindings.secret(),
            }
          : {}),
        ...(hosted ? { TABLECAST_OTEL_AUTHORIZATION: bindings.secret() } : {}),
        ...(emulate ? { TABLECAST_CONTAINER_METRICS_TOKEN: bindings.secret() } : {}),
        ...(options.environment === "preview"
          ? {
              CF_ACCESS_CLIENT_ID: bindings.secret(),
              CF_ACCESS_CLIENT_SECRET: bindings.secret(),
            }
          : {}),
        ...(options.environment === "production"
          ? {
              TABLECAST_GOOGLE_CLIENT_ID: bindings.secret(),
              TABLECAST_GOOGLE_CLIENT_SECRET: bindings.secret(),
              TABLECAST_BETTER_AUTH_API_KEY: bindings.secret(),
            }
          : {}),
      },
    },
    containers: container ? [container] : [],
  });
}

export function webCloudflareConfig(input: TablecastConfigOptions = {}) {
  const options = optionsSchema.parse(input);
  return defineConfig({
    ...(options.accountId ? { accountId: options.accountId } : {}),
    worker: {
      name: input.name ?? "tablecast-web",
      entrypoint: resolve(root, "apps/web/src/server.ts"),
      compatibilityDate: tablecastCompatibilityDate,
      compatibilityFlags: ["nodejs_compat"],
      workersDev: true,
      previewUrls: false,
      observability: { enabled: true },
      env: {
        TABLECAST_API: bindings.worker({ worker: options.api }),
        ...Object.fromEntries(
          Object.entries(options.vars).map(([key, value]) => [key, bindings.text(value)]),
        ),
        ...(["preview", "staging", "production"].includes(options.environment)
          ? { TABLECAST_OTEL_AUTHORIZATION: bindings.secret() }
          : {}),
      },
    },
  });
}

// 公式SDKだけが旧形式を必要とする。設定の変換は公式APIへ任せる。
export function sdkConfiguration(
  config: ReturnType<typeof apiCloudflareConfig> | ReturnType<typeof webCloudflareConfig>,
) {
  return convertToWranglerConfig(InputConfigSchema.parse(config));
}
