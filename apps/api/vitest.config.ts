import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
const unitTests = [
  "test/localization.test.ts",
  "test/store-knowledge.test.ts",
  "test/catalog-search.test.ts",
  "test/currency-display.test.ts",
  "test/pricing.test.ts",
  "test/food.test.ts",
  "test/billing-pricing.test.ts",
  "test/instructions.test.ts",
  "test/container-metrics.test.ts",
];
const performanceTests = ["test/table-operation-performance.test.ts"];
const tablecastMigrations = await readD1Migrations("./migrations");
// HTTP性能の標本へ他fileのworkerd起動待ちを混ぜず、同じ300ms予算で後段に測る。
const bindings = (performance = false) => ({
  plugins: [
    cloudflareTest({
      experimental: { newConfig: { configPath: "./cloudflare.config.ts" } },
      remoteBindings: false,
      miniflare: {
        // VitestはWorkerをrunner名へ変更するため、同じ実DOをself bindingとして起動する。
        durableObjects: {
          TABLECAST_VOICE_USAGE: "TablecastVoiceUsage",
          TABLECAST_EVENTS: "StoreEvents",
          TABLECAST_EMULATE: "TablecastEmulate",
        },
        bindings: {
          TABLECAST_AUTH_SECRET: "tablecast-test-secret-that-is-long-enough-for-local-tests",
          TABLECAST_ENV: "test",
          // ローカルの実接続設定を通常テストへ持ち込まない。
          TABLECAST_VOICE_ENABLED: "false",
          TABLECAST_MODEL_API_KEY: "",
          TABLECAST_MODEL: "",
          TABLECAST_LANGFUSE_BASE_URL: "",
          TABLECAST_LANGFUSE_PUBLIC_KEY: "",
          TABLECAST_LANGFUSE_SECRET_KEY: "",
          TABLECAST_ORGANIZATION_AI_ENABLED: "false",
          TABLECAST_OPENAI_ADMIN_API_KEY: "",
          TABLECAST_OPENAI_PROJECT_ID: "",
          TABLECAST_OPENAI_KEY_ENCRYPTION_SECRET: "tablecast-local-encryption-secret-32-characters",
          TABLECAST_BILLING_ENABLED: "false",
          TABLECAST_BILLING_RATES: "",
          TABLECAST_BILLING_OPERATOR_USER_IDS: "",
          TABLECAST_STRIPE_SECRET_KEY: "",
          TABLECAST_STRIPE_WEBHOOK_SECRET: "",
          TABLECAST_PUBLIC_ORIGIN: "http://localhost:3000",
        },
      },
    }),
  ],
  test: {
    setupFiles: ["./test/setup.ts"],
    // Vitest 5のwarm module一括転送はworkerdのWebSocket上限を超える。上流: workers-sdk#16331。
    fsModuleCache: false,
    maxWorkers: performance ? 1 : 4,
    name: performance ? "performance" : "bindings",
    include: performance ? performanceTests : ["test/**/*.test.ts"],
    exclude: performance ? unitTests : [...unitTests, ...performanceTests],
    sequence: { groupOrder: performance ? 1 : 0 },
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: [
            "better-auth",
            "better-auth/plugins",
            "better-auth/api",
            "better-auth/db",
            "@better-auth/drizzle-adapter/relations-v2",
            "@better-auth/oauth-provider",
            "@better-auth/passkey",
            "@better-auth/infra",
          ],
          // workerdのnative moduleを残し、依存の変換成果物を再利用する。
          rolldownOptions: { external: [/^(node|cloudflare|workerd):/] },
        },
      },
    },
    fileParallelism: !performance,
    testTimeout: 30000,
    hookTimeout: 30000,
    provide: { tablecastMigrations },
  },
});
export default defineConfig({
  test: {
    maxWorkers: 4,
    projects: [
      {
        test: {
          name: "unit",
          maxWorkers: 4,
          include: unitTests,
          environment: "node",
        },
      },
      bindings(),
      bindings(true),
    ],
  },
});
