import { fileURLToPath } from "node:url";
import { defineConfig } from "oxlint";
import { RECOMMENDED_RULES, TANSTACK_QUERY_RULES } from "oxlint-plugin-react-doctor";
import rootConfig from "../../oxlint.config.ts";

// 実ファイルの役割を分類し、未知の配置と依存方向を検査する。
const boundaryFiles = [
  ["test", "src/**/*.{test,stories}.{ts,tsx}"],
  ["route", "src/routes/*.tsx"],
  ["router", "src/router.tsx"],
  ["server", "src/{server,lib/api-fetch.server}.ts"],
  ["lib", "src/sw.ts"],
  ["transport", "src/lib/{api,api-fetch,auth-client}.ts"],
  ["lib", "src/lib/*.{ts,tsx}"],
  ["ui", "src/components/ui/*.{ts,tsx}"],
  ["component", "src/components/*.{ts,tsx}"],
  ["component", "src/components/ai-elements/*.tsx"],
  ["component", "src/components/form/*.{ts,tsx}"],
  ["i18n", "src/i18n/*.{ts,tsx}"],
  ["generated", "src/paraglide/**"],
  ["generated", "src/routeTree.gen.ts"],
  ["asset", "src/*.css"],
  ["declaration", "src/env.d.ts"],
  ["model", "src/features/*/*-{model,defaults}.ts"],
  ["query", "src/features/*/*-query.ts"],
  ["model", "src/features/kiosk/table-cache.ts"],
  ["runtime", "src/features/kiosk/voice-connection.ts"],
  ["model", "src/features/store/device-qr-code.ts"],
  ["feature", "src/features/*/*.tsx"],
];

export default defineConfig({
  extends: [rootConfig],
  jsPlugins: [
    "oxlint-tailwindcss",
    { name: "storybook", specifier: "eslint-plugin-storybook" },
    { name: "playwright", specifier: "eslint-plugin-playwright" },
    { name: "react-doctor", specifier: "oxlint-plugin-react-doctor" },
    { name: "query", specifier: "@tanstack/eslint-plugin-query" },
    { name: "router", specifier: "@tanstack/eslint-plugin-router" },
    { name: "boundaries", specifier: "eslint-plugin-boundaries" },
  ],
  rules: {
    "boundaries/no-unknown-files": "error",
    "boundaries/no-unknown-dependencies": "error",
    "boundaries/dependencies": [
      "error",
      {
        default: "disallow",
        checkAllOrigins: true,
        checkInternals: true,
        policies: [
          ...Object.entries({
            test: [
              "test",
              "feature",
              "model",
              "query",
              "runtime",
              "component",
              "ui",
              "lib",
              "transport",
              "i18n",
            ],
            route: [
              "feature",
              "query",
              "model",
              "component",
              "ui",
              "lib",
              "i18n",
              "generated",
              "asset",
            ],
            router: ["generated", "component", "lib"],
            server: ["server", "generated"],
            transport: ["transport", "lib", "server"],
            lib: ["lib", "transport", "server"],
            component: ["component", "ui", "lib", "i18n"],
            ui: ["ui"],
            i18n: ["i18n", "generated"],
            model: ["model"],
            query: ["query", "model", "lib", "transport"],
            runtime: ["runtime", "model", "lib", "transport"],
            feature: ["query", "model", "runtime", "component", "ui", "lib", "transport", "i18n"],
          }).map(([from, to]) => ({
            from: { file: { categories: from } },
            allow: { to: { file: { categories: to } } },
          })),
          ...["account", "store", "kiosk", "shell"].map((feature) => ({
            from: { file: { categories: "feature", captured: { feature } } },
            allow: {
              to: { file: { categories: "feature", captured: { feature: [feature, "shell"] } } },
            },
          })),
          { allow: { to: { module: { origin: ["external", "core"] } } } },
          { disallow: { to: { module: { source: "@tablecast/api" } } } },
          { allow: { to: { module: { source: "@tablecast/api", internalPath: "schema" } } } },
          {
            from: { file: { categories: "transport" } },
            allow: { to: { module: { source: "@tablecast/api", internalPath: "client" } } },
          },
          {
            from: { file: { categories: "ui" } },
            disallow: { to: { module: { source: "@tablecast/api" } } },
          },
          {
            disallow: {
              to: { module: { source: ["drizzle-orm", "hono", "@hono/*", "bun", "bun:*"] } },
            },
          },
          {
            from: { file: { categories: ["ui", "model"] } },
            disallow: {
              to: {
                module: {
                  source: [
                    "@tanstack/react-query",
                    "@tanstack/react-start",
                    "better-auth",
                    "@better-auth/*",
                  ],
                },
              },
            },
          },
        ],
      },
    ],
    ...RECOMMENDED_RULES,
    ...TANSTACK_QUERY_RULES,
    // React Compilerを採用していないため、手動memo化は必要性に応じて使用する。
    "react-doctor/react-compiler-no-manual-memoization": "off",
    "react/incompatible-library": "off",
    "query/exhaustive-deps": "error",
    "query/infinite-query-property-order": "error",
    "query/mutation-property-order": "error",
    "query/no-rest-destructuring": "warn",
    "query/no-unstable-deps": "error",
    "query/no-void-query-fn": "error",
    "query/stable-query-client": "error",
    "router/create-route-property-order": "error",
    "jsx-a11y/prefer-tag-over-role": "off",
    "tailwindcss/enforce-canonical": "warn",
    "tailwindcss/enforce-shorthand": "warn",
    "tailwindcss/no-conflicting-classes": "error",
    "tailwindcss/no-deprecated-classes": "error",
    "tailwindcss/no-duplicate-classes": "error",
    "tailwindcss/no-hardcoded-colors": "warn",
    "tailwindcss/no-unknown-classes": "error",
    "tailwindcss/no-unnecessary-arbitrary-value": "warn",
    "tailwindcss/no-unnecessary-whitespace": "error",
  },
  overrides: [
    {
      files: ["e2e/**/*.ts"],
      rules: {
        "playwright/missing-playwright-await": "error",
        "playwright/no-element-handle": "error",
        "playwright/no-focused-test": "error",
        "playwright/no-force-option": "error",
        "playwright/no-networkidle": "error",
        "playwright/no-page-pause": "error",
        "playwright/no-wait-for-timeout": "error",
        "playwright/prefer-native-locators": "error",
        "playwright/prefer-web-first-assertions": "error",
        "playwright/valid-expect": "error",
      },
    },
    {
      files: ["src/**/*.stories.{ts,tsx}"],
      rules: {
        "storybook/await-interactions": "error",
        "storybook/context-in-play-function": "error",
        "storybook/default-exports": "error",
        "storybook/no-renderer-packages": "error",
        "storybook/story-exports": "error",
        "storybook/use-storybook-expect": "error",
        "storybook/use-storybook-testing-library": "error",
      },
    },
    {
      files: ["src/i18n/locale.tsx"],
      rules: { "import/namespace": ["error", { allowComputed: true }] },
    },
  ],
  settings: {
    "boundaries/root-path": import.meta.dirname,
    "boundaries/include": ["src/**/*.{ts,tsx}"],
    "boundaries/files-single-match": true,
    "boundaries/files": boundaryFiles.map(([category, pattern]) => ({
      category,
      pattern,
      capture: ["feature"],
    })),
    "import/resolver": { typescript: { project: `${import.meta.dirname}/tsconfig.json` } },
    react: { version: "19.2.8" },
    tailwindcss: {
      entryPoint: fileURLToPath(new URL("./src/styles.css", import.meta.url)),
      callees: ["cn", "tv"],
    },
  },
  ignorePatterns: ["src/paraglide/**", "src/routeTree.gen.ts", "dist/**", "storybook-static/**"],
});
