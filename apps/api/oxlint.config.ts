import { defineConfig } from "oxlint";
import rootConfig from "../../oxlint.config.ts";

const root = import.meta.dirname;
// ファイル単位で分類する。module配下への未分類ファイル追加も検査対象にする。
const files = [
  ["app", "src/app.ts"],
  ["worker", "src/worker.ts"],
  ["client", "src/client.ts"],
  ["schema", "src/schema.ts"],
  ["bootstrap", "src/bootstrap.ts"],
  ["context", "src/platform/context.ts"],
  ["telemetry", "src/platform/telemetry.ts"],
  ["http", "src/platform/{http,validation}.ts"],
  ["error", "src/platform/errors.ts"],
  ["model", "src/platform/model.ts"],
  ["db", "src/db/{auth-schema,business-schema,records}.ts"],
  ["email", "src/emails/*.{ts,tsx}"],
  ["runtime", "src/{containers,realtime/store-events}.ts"],
  ["store-routes", "src/modules/stores/routes.ts"],
  ["auth-middleware", "src/modules/auth/middleware.ts"],
  ["auth-factory", "src/modules/auth/{service,options,preview}.ts"],
  ["voice-operation", "src/modules/voice/{agent,realtime,turns,session}.ts"],
  ["provider", "src/modules/voice/{runtime,catalog}.ts"],
  ["pure", "src/modules/{catalog/pricing,auth/policy,voice/prompt,voice/diagnostics}.ts"],
  ["mutation", "src/modules/tables/mutations.ts"],
  ["model", "src/modules/*/model.ts"],
  ["query", "src/modules/*/{queries,history}.ts"],
  ["service", "src/modules/*/service.ts"],
  ["route", "src/modules/*/*routes.ts"],
];
// 左がimport元、右が許可する依存先。外部packageとContextのtype-onlyは別に制限する。
const dependencies = {
  app: ["route", "store-routes", "http", "context"],
  worker: ["app", "runtime", "telemetry"],
  telemetry: [],
  client: ["app"],
  schema: ["model"],
  bootstrap: ["model", "pure", "error", "db", "auth-factory"],
  context: ["auth-factory", "model"],
  http: ["http", "error", "telemetry"],
  error: [],
  model: ["model"],
  db: ["db"],
  email: ["email", "error"],
  runtime: [],
  "auth-factory": ["auth-factory", "model", "db", "email", "error"],
  "auth-middleware": ["query", "model", "auth-factory", "error"],
  pure: ["model", "pure", "error"],
  provider: ["model", "pure", "error"],
  query: ["query", "db", "model", "pure", "error"],
  mutation: ["db", "model", "query", "error"],
  service: [
    "telemetry",
    "service",
    "query",
    "mutation",
    "db",
    "model",
    "pure",
    "provider",
    "auth-factory",
    "error",
  ],
  "voice-operation": [
    "voice-operation",
    "service",
    "query",
    "mutation",
    "db",
    "model",
    "pure",
    "provider",
    "error",
  ],
  route: [
    "service",
    "query",
    "voice-operation",
    "provider",
    "model",
    "pure",
    "auth-middleware",
    "auth-factory",
    "http",
    "error",
  ],
  "store-routes": ["service", "query", "model", "auth-middleware", "http", "error"],
};

export default defineConfig({
  extends: [rootConfig],
  jsPlugins: [
    { name: "drizzle", specifier: "eslint-plugin-drizzle" },
    { name: "hono", specifier: "eslint-plugin-hono" },
    { name: "boundaries", specifier: "eslint-plugin-boundaries" },
  ],
  settings: {
    "boundaries/root-path": root,
    "boundaries/include": ["src/**/*.{ts,tsx}"],
    "boundaries/files-single-match": true,
    "boundaries/files": files.map(([category, pattern]) => ({
      category,
      pattern,
      capture: ["module"],
    })),
    "import/resolver": {
      typescript: { project: `${root}/tsconfig.json` },
    },
  },
  rules: {
    "drizzle/enforce-delete-with-where": ["error", { drizzleObjectName: ["db"] }],
    "drizzle/enforce-update-with-where": ["error", { drizzleObjectName: ["db"] }],
    "hono/param-name-mismatch": "error",
    "hono/no-multiple-next": "error",
    "hono/no-unused-context-response": "error",
    "hono/no-process-env": "error",
    "hono/global-middleware-placement": "error",
    "boundaries/no-unknown-files": "error",
    "boundaries/no-unknown-dependencies": "error",
    "boundaries/dependencies": [
      "error",
      {
        default: "disallow",
        checkAllOrigins: true,
        checkInternals: true,
        policies: [
          ...Object.entries(dependencies).map(([from, to]) => ({
            from: { file: { categories: from } },
            allow: { to: { file: { categories: to } } },
          })),
          { allow: { to: { module: { origin: ["external", "core"] } } } },
          {
            from: {
              file: {
                categories: [
                  "route",
                  "store-routes",
                  "auth-middleware",
                  "service",
                  "query",
                  "mutation",
                  "voice-operation",
                  "auth-factory",
                  "http",
                ],
              },
            },
            allow: { to: { file: { categories: "context" } }, dependency: { kind: "type" } },
          },
          {
            from: { file: { categories: "store-routes" } },
            allow: {
              to: {
                file: {
                  categories: "route",
                  captured: {
                    module: ["catalog", "configuration", "devices", "orders", "tables", "voice"],
                  },
                },
              },
            },
          },
          {
            from: { file: { categories: ["model", "pure", "db"] } },
            disallow: { to: { module: { origin: ["external", "core"] } } },
          },
          { from: { file: { categories: "model" } }, allow: { to: { module: { source: "zod" } } } },
          {
            from: { file: { categories: "db" } },
            allow: { to: { module: { source: ["drizzle-orm", "drizzle-orm/*"] } } },
          },
          {
            from: {
              file: {
                categories: [
                  "service",
                  "query",
                  "mutation",
                  "voice-operation",
                  "auth-factory",
                  "provider",
                ],
              },
            },
            disallow: { to: { module: { source: ["hono", "hono/*", "@hono/*"] } } },
          },
          {
            from: { file: { categories: ["route", "store-routes", "auth-middleware", "app"] } },
            disallow: { to: { module: { source: ["drizzle-orm", "drizzle-orm/*"] } } },
          },
          {
            from: {
              file: { categories: ["service", "query", "mutation", "voice-operation", "provider"] },
            },
            disallow: { to: { module: { source: "drizzle-orm", internalPath: "d1" } } },
          },
        ],
      },
    ],
  },
  overrides: [
    {
      files: ["src/modules/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["**/web/src/**", "bun", "bun:*"],
                message: "APIはWeb内部やBun runtimeへ依存しない。",
              },
              {
                group: ["**/service", "**/service.ts"],
                importNames: ["createAuth"],
                message: "AuthはContextの共有インスタンスを使い、module内で生成しない。",
              },
            ],
          },
        ],
        "no-restricted-properties": [
          "error",
          { property: "prepare", message: "共有DBのDrizzle builder・sql・batchを使う。" },
        ],
      },
    },
  ],
});
