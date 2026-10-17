import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
const unitTests = [
  "test/pricing.test.ts",
  "test/instructions.test.ts",
  "test/container-metrics.test.ts",
];
const bindings = {
  plugins: [
    cloudflareTest({
      experimental: { newConfig: { configPath: "./cloudflare.config.ts" } },
      remoteBindings: false,
      miniflare: {
        // VitestはWorkerをrunner名へ変更するため、同じ実DOをself bindingとして起動する。
        durableObjects: { TABLECAST_EVENTS: "StoreEvents", TABLECAST_EMULATE: "TablecastEmulate" },
        bindings: {
          TABLECAST_AUTH_SECRET: "tablecast-test-secret-that-is-long-enough-for-local-tests",
          TABLECAST_ENV: "test",
          TABLECAST_PUBLIC_ORIGIN: "http://localhost:3000",
        },
      },
    }),
  ],
  test: {
    setupFiles: ["./test/setup.ts"],
    // Vitest 5のwarm module一括転送はworkerdのWebSocket上限を超える。上流: workers-sdk#16331。
    fsModuleCache: false,
    maxWorkers: 4,
    name: "bindings",
    include: ["test/**/*.test.ts"],
    exclude: unitTests,
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: [
            "better-auth",
            "better-auth/plugins",
            "better-auth/api",
            "better-auth/db",
            "@better-auth/drizzle-adapter",
            "@better-auth/oauth-provider",
            "@better-auth/passkey",
            "@better-auth/infra",
          ],
          // workerdのnative moduleを残し、依存の変換成果物を再利用する。
          rolldownOptions: { external: [/^(node|cloudflare|workerd):/] },
        },
      },
    },
    fileParallelism: true,
    testTimeout: 30000,
    hookTimeout: 30000,
    provide: { tablecastMigrations: await readD1Migrations("./migrations") },
  },
};
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
      bindings,
    ],
  },
});
