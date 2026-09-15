import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
const bindings = {
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      remoteBindings: false,
      miniflare: {
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
    name: "bindings",
    include: ["test/**/*.test.ts"],
    exclude: ["test/pricing.test.ts", "test/instructions.test.ts"],
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
          include: ["test/pricing.test.ts", "test/instructions.test.ts"],
          environment: "node",
        },
      },
      bindings,
    ],
  },
});
