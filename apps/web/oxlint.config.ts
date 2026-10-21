import { fileURLToPath } from "node:url";
import { defineConfig } from "oxlint";
import { RECOMMENDED_RULES, TANSTACK_QUERY_RULES } from "oxlint-plugin-react-doctor";
import rootConfig from "../../oxlint.config.ts";
import { boundaryFiles, boundaryPolicies } from "./oxlint.boundaries.ts";

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
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@tablecast/api", "@tablecast/api/db", "@tablecast/api/bootstrap"],
            message: "Webはschema/clientなどの公開契約だけを使用します。",
          },
        ],
      },
    ],
    "boundaries/no-unknown-files": "error",
    "boundaries/no-unknown-dependencies": "error",
    "boundaries/dependencies": [
      "error",
      {
        default: "disallow",
        checkAllOrigins: true,
        checkInternals: true,
        policies: boundaryPolicies,
      },
    ],
    ...RECOMMENDED_RULES,
    // 行数はレビューで判断し、関数の複雑度は必須検査を維持する。
    "react-doctor/no-giant-component": "off",
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
    "tailwindcss/no-hardcoded-colors": "error",
    "tailwindcss/no-restricted-classes": [
      "error",
      {
        patterns: [
          {
            pattern:
              "(?:^|:)(?:bg|text|border|ring|fill|stroke|divide|outline|accent|decoration|from|via|to)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]",
            message: "原色スケールではなくstyles.cssの意味別トークンを使ってください。",
          },
          {
            pattern:
              "(?:^|:)(?:bg|text|border|ring|fill|stroke|divide|outline|accent|decoration|from|via|to)-(?:black|white)(?:/|$)",
            message:
              "純黒・白の直指定ではなくcard、inverse、on-inverse、overlayなど用途を示してください。",
          },
        ],
      },
    ],
    "tailwindcss/no-unknown-classes": "error",
    "tailwindcss/no-unnecessary-arbitrary-value": "warn",
    "tailwindcss/no-unnecessary-whitespace": "error",
  },
  overrides: [
    { files: ["src/**/test-support/**"], rules: { "react-doctor/only-export-components": "off" } },
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
    // React Doctor公式CLIと同じ診断意味論を使う。ruleのseverityは推奨のまま維持する。
    "react-doctor": { portedRuleMode: "curated" },
    "boundaries/root-path": import.meta.dirname,
    "boundaries/include": ["src/**/*.{ts,tsx}"],
    "boundaries/files-single-match": true,
    "boundaries/files": boundaryFiles.map(([category, pattern]) => ({
      category,
      pattern,
      capture: ["feature", "module"],
    })),
    "import/resolver": { typescript: { project: `${import.meta.dirname}/tsconfig.json` } },
    react: { version: "19.3.1" },
    tailwindcss: {
      entryPoint: fileURLToPath(new URL("./src/styles.css", import.meta.url)),
      callees: ["cn", "tv"],
    },
  },
  ignorePatterns: ["src/paraglide/**", "src/routeTree.gen.ts", "dist/**", "storybook-static/**"],
});
