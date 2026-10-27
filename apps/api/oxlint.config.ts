import { defineConfig } from "oxlint";
import rootConfig from "../../oxlint.config.ts";
import { dependencies } from "./config/dependencies.ts";
import { files } from "./config/files.ts";
import { modulePolicies } from "./config/module-contracts.ts";

const root = import.meta.dirname;

export default defineConfig({
  extends: [rootConfig],
  ignorePatterns: ["src/cloudflare-env.d.ts"],
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
          {
            from: { file: { categories: "auth-factory" } },
            allow: { to: { file: { path: "src/modules/auth/passkey-policy.ts" } } },
          },
          ...Object.entries(dependencies).map(([from, to]) => ({
            from: { file: { categories: from } },
            allow: { to: { file: { categories: to } } },
          })),
          // リクエストのDrizzle生成時に認証の関連queryを有効にする。
          {
            from: { file: { categories: "context" } },
            allow: { to: { file: { path: "src/db/client.ts" } } },
          },
          { allow: { to: { module: { origin: ["external", "core"] } } } },
          {
            from: {
              file: {
                categories: [
                  "route",
                  "store-routes",
                  "auth-middleware",
                  "service",
                  "use-case",
                  "mcp-tools",
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
                    module: [
                      "catalog",
                      "statistics",
                      "customer-points",
                      "customer-coupons",
                      "configuration",
                      "games",
                      "devices",
                      "media",
                      "orders",
                      "tables",
                      "voice",
                    ],
                  },
                },
              },
            },
          },
          {
            from: { file: { categories: ["model", "pure", "db"] } },
            disallow: { to: { module: { origin: ["external", "core"] } } },
          },
          {
            from: { file: { categories: ["model", "pure"] } },
            allow: { to: { module: { source: "zod" } } },
          },
          {
            from: { file: { path: "src/modules/catalog/search.ts" } },
            allow: { to: { module: { source: "fuse.js" } } },
          },
          {
            from: { file: { path: "src/modules/appearance/{model.ts,css-tree.d.ts}" } },
            allow: { to: { module: { source: ["css-tree", "css-tree/*"] } } },
          },
          {
            from: { file: { categories: "db" } },
            allow: { to: { module: { source: ["drizzle-orm", "drizzle-orm/*"] } } },
          },
          {
            from: {
              file: {
                categories: [
                  "service",
                  "use-case",
                  "mcp-tools",
                  "query",
                  "mutation",
                  "voice-operation",
                  "auth-factory",
                  "provider",
                  "integration",
                  "mcp-tools",
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
              file: {
                categories: [
                  "service",
                  "query",
                  "mutation",
                  "voice-operation",
                  "provider",
                  "integration",
                  "mcp-tools",
                  "integration",
                  "use-case",
                  "mcp-tools",
                ],
              },
            },
            disallow: { to: { module: { source: "drizzle-orm", internalPath: "d1" } } },
          },
          {
            from: { file: { categories: ["context", "pure"] } },
            allow: { to: { file: { path: "src/db/records.ts" } }, dependency: { kind: "type" } },
          },
          ...modulePolicies,
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
