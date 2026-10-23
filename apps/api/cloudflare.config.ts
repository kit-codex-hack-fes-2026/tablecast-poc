import { convertToWranglerConfig, InputConfigSchema } from "@cloudflare/config";
import { bindings, defineConfig, defineContainer, exports, triggers } from "cf/config";
import { resolve } from "node:path";
import {
  modeOptions,
  optionsSchema,
  requiredApiSecrets,
  tablecastCompatibilityDate,
  type TablecastConfigOptions,
} from "../../scripts/tablecast-deploy-config.ts";

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
      entrypoint: resolve(import.meta.dirname, "src/worker.ts"),
      compatibilityDate: tablecastCompatibilityDate,
      compatibilityFlags: ["nodejs_compat", "nodejs_compat_do_not_populate_process_env"],
      workersDev: false,
      previewUrls: false,
      placement: { mode: "smart" },
      observability: { enabled: true, headSamplingRate: 1 },
      triggers: [triggers.scheduled({ schedule: "*/5 * * * *" })],
      exports: {
        StoreEvents: exports.durableObject({ storage: "sqlite" }),
        TablecastVoiceUsage: exports.durableObject({ storage: "sqlite" }),
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
        TABLECAST_ORGANIZATION_AI_ENABLED: bindings.text("false"),
        TABLECAST_OPENAI_PROJECT_ID: bindings.text(""),
        TABLECAST_BILLING_ENABLED: bindings.text("false"),
        TABLECAST_BILLING_RATES: bindings.text(""),
        TABLECAST_BILLING_OPERATOR_USER_IDS: bindings.text(""),
        ...Object.fromEntries(
          Object.entries(options.vars).map(([key, value]) => [key, bindings.text(value)]),
        ),
        TABLECAST_DB: bindings.d1(options.database),
        TABLECAST_MEDIA: bindings.r2({ name: options.bucket }),
        TABLECAST_IMAGES: bindings.images(),
        TABLECAST_EMAIL: bindings.sendEmail(),
        TABLECAST_VOICE_USAGE: bindings.durableObject({
          worker: options.name,
          exportName: "TablecastVoiceUsage",
        }),
        TABLECAST_EVENTS: bindings.durableObject({
          worker: options.name,
          exportName: "StoreEvents",
        }),
        TABLECAST_EMULATE: bindings.durableObject({
          worker: options.name,
          exportName: "TablecastEmulate",
        }),
        ...Object.fromEntries(
          requiredApiSecrets(
            options.environment,
            options.vars.TABLECAST_VOICE_ENABLED === "true",
            options.vars,
          ).map((name) => [name, bindings.secret()]),
        ),
      },
    },
    containers: container ? [container] : [],
  });
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
        migrations_dir: resolve(import.meta.dirname, "migrations"),
      })) ?? [],
    r2_buckets: config.r2_buckets ?? [],
    // 公式converterはself bindingにもscript_nameを出す。SDKの単独storage接続ではselfへ統一する。
    durable_objects: {
      bindings:
        config.durable_objects?.bindings?.map(({ script_name: _script, ...binding }) => binding) ??
        [],
    },
    vars: { ...optionsSchema.shape.vars.parse(config.vars), ...input.vars },
    containers: config.containers ?? [],
  };
}

export default defineConfig(({ mode }) => apiCloudflareConfig(modeOptions("api", mode)));
