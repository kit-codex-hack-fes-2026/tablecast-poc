import { defineConfig } from "@playwright/test";
import { execFileSync } from "node:child_process";

export default defineConfig<{ releaseSha: string }>({
  testDir: "./capture",
  globalSetup: "../web/e2e/support/global-setup.ts",
  outputDir: "./output/tablecast-pr-capture",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "output/tablecast-pr-capture-results.json" }]],
  use: {
    browserName: "chromium",
    channel: "chrome",
    releaseSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    trace: "off",
    screenshot: "only-on-failure",
  },
});
