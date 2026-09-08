import { fileURLToPath } from "node:url";
import { defineConfig } from "oxlint";
import { RECOMMENDED_RULES, TANSTACK_QUERY_RULES } from "oxlint-plugin-react-doctor";
import rootConfig from "../../oxlint.config.ts";
export default defineConfig({
  extends: [rootConfig],
  jsPlugins: [
    "oxlint-tailwindcss",
    { name: "react-doctor", specifier: "oxlint-plugin-react-doctor" },
    { name: "query", specifier: "@tanstack/eslint-plugin-query" },
    { name: "router", specifier: "@tanstack/eslint-plugin-router" },
  ],
  rules: {
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
      files: ["src/i18n/locale.tsx"],
      rules: { "import/namespace": ["error", { allowComputed: true }] },
    },
  ],
  settings: {
    react: { version: "19.2.8" },
    tailwindcss: {
      entryPoint: fileURLToPath(new URL("./src/styles.css", import.meta.url)),
      callees: ["cn", "cva", "clsx"],
    },
  },
  ignorePatterns: ["src/paraglide/**", "src/routeTree.gen.ts", "dist/**", "storybook-static/**"],
});
