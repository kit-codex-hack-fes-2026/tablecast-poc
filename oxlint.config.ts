import { defineConfig } from "oxlint";

export default defineConfig({
  options: { typeAware: true },
  plugins: ["typescript", "import", "react", "jsx-a11y", "vitest"],
  categories: { correctness: "error", suspicious: "warn" },
  rules: {
    "typescript/no-floating-promises": "error",
    "typescript/no-misused-promises": "error",
    "typescript/no-explicit-any": "error",
    "typescript/no-non-null-assertion": "error",
    "typescript/no-unsafe-assignment": "error",
    "typescript/no-unsafe-call": "error",
    "typescript/no-unsafe-return": "error",
    "typescript/consistent-type-imports": "error",
    "import/no-cycle": "error",
    "import/no-self-import": "error",
    "import/no-duplicates": "error",
    "vitest/no-focused-tests": "error",
    "react/react-in-jsx-scope": "off",
    "import/no-unassigned-import": ["warn", { allow: ["**/*.css"] }],
  },
  overrides: [
    {
      files: ["apps/web/src/i18n/locale.tsx"],
      rules: { "import/namespace": ["error", { allowComputed: true }] },
    },
    {
      files: ["apps/web/src/**/*.{ts,tsx}"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              "**/api/src/**",
              "@tablecast/api/src/**",
              "@tablecast/api/db/**",
              "@tablecast/api/auth/**",
              "@tablecast/api/agent/**",
            ],
          },
        ],
      },
    },
    {
      files: ["apps/api/src/**/*.ts"],
      rules: {
        "no-restricted-imports": ["error", { patterns: ["**/web/src/**", "bun", "bun:*"] }],
      },
    },
  ],
  ignorePatterns: [
    "**/dist/**",
    "**/storybook-static/**",
    "**/worker-configuration.d.ts",
    "**/src/cloudflare-env.d.ts",
    "**/src/routeTree.gen.ts",
    "**/src/paraglide/**",
    "**/.wrangler/**",
    "**/.local/**",
    "**/.venv/**",
  ],
});
