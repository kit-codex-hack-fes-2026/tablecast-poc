import { bindings, defineConfig } from "cf/config";
import { resolve } from "node:path";
import {
  modeOptions,
  optionsSchema,
  tablecastCompatibilityDate,
  type TablecastConfigOptions,
} from "../../scripts/tablecast-deploy-config.ts";

export function webCloudflareConfig(input: TablecastConfigOptions = {}) {
  const options = optionsSchema.parse(input);
  return defineConfig({
    ...(options.accountId ? { accountId: options.accountId } : {}),
    worker: {
      name: input.name ?? "tablecast-web",
      entrypoint: resolve(import.meta.dirname, "src/server.ts"),
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

export default defineConfig(({ mode }) => webCloudflareConfig(modeOptions("web", mode)));
