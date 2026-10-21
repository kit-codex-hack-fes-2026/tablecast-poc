import { defineConfig } from "oxlint";

export default defineConfig({
  options: { typeAware: true },
  plugins: ["typescript", "import", "react", "jsx-a11y", "vitest"],
  jsPlugins: [{ name: "perfectionist", specifier: "eslint-plugin-perfectionist" }],
  categories: { correctness: "error", suspicious: "warn" },
  rules: {
    "typescript/no-floating-promises": "error",
    "typescript/no-misused-promises": "error",
    "typescript/no-explicit-any": "error",
    "typescript/no-non-null-assertion": "error",
    "typescript/no-unsafe-assignment": "error",
    "typescript/no-unsafe-call": "error",
    "typescript/no-unsafe-return": "error",
    "typescript/no-unsafe-argument": "error",
    "typescript/no-unsafe-member-access": "error",
    "typescript/switch-exhaustiveness-check": [
      "error",
      { considerDefaultExhaustiveForUnions: false },
    ],
    "typescript/consistent-type-imports": "error",
    "import/no-cycle": "error",
    "import/no-self-import": "error",
    "import/no-duplicates": "error",
    "vitest/no-focused-tests": "error",
    "react/react-in-jsx-scope": "off",
    "import/no-unassigned-import": ["warn", { allow: ["**/*.css"] }],
    "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
    "perfectionist/sort-imports": [
      "error",
      { type: "natural", order: "asc", sortSideEffects: false, newlinesBetween: 0 },
    ],
    "perfectionist/sort-named-imports": ["error", { type: "natural", order: "asc" }],
    "perfectionist/sort-exports": ["error", { type: "natural", order: "asc" }],
    "perfectionist/sort-named-exports": ["error", { type: "natural", order: "asc" }],
    "perfectionist/sort-interfaces": ["error", { type: "natural", order: "asc" }],
    "perfectionist/sort-object-types": ["error", { type: "natural", order: "asc" }],
    "perfectionist/sort-union-types": ["error", { type: "natural", order: "asc" }],
    "perfectionist/sort-intersection-types": ["error", { type: "natural", order: "asc" }],
  },
  overrides: [
    {
      files: ["scripts/**/*.{ts,tsx}"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              "**/apps/api/src/**",
              "@tablecast/api/src/**",
              "@tablecast/api/modules/**",
              "@tablecast/api/platform/**",
            ],
          },
        ],
      },
    },
    {
      files: [
        "**/*.{test,spec,stories}.{ts,tsx,js,jsx}",
        "**/test/**",
        "**/e2e/**",
        "**/test-support/**",
        "**/testing/**",
        "apps/web/src/features/billing/billing-fixture.ts",
      ],
      rules: { "max-lines": ["error", { max: 500, skipBlankLines: true, skipComments: true }] },
    },
    {
      files: [
        "scripts/tablecast-seed*.ts",
        "scripts/tablecast-deploy*.ts",
        "scripts/tablecast-seed/**/*.ts",
        "scripts/tablecast-deploy/**/*.ts",
      ],
      rules: {
        "no-restricted-properties": [
          "error",
          {
            property: "prepare",
            message: "D1の直接操作は禁止。既存schemaとDrizzleのquery builder・db.batch()を使う。",
          },
        ],
      },
    },
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
    // 取得済みskillのサンプルは取得元で管理し、製品・運用CLIの検査へ含めない。
    ".agents/skills/conventional-commit/assets/**",
    ".agents/skills/animate/**",
    ".agents/skills/emil-design-eng/**",
    ".agents/skills/hyperframes-core/**",
    ".agents/skills/hyperframes-animation/**",
    ".agents/skills/hyperframes-creative/**",
    ".agents/skills/mastra/**",
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
