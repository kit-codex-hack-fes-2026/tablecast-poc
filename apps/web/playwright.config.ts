import { defineConfig } from "@playwright/test";
import { runtime } from "./e2e/support/runtime";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/support/global-setup.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: runtime.origin,
    viewport: { width: 1024, height: 768 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "tablecast-chromium", use: { browserName: "chromium" } },
    { name: "tablecast-webkit", use: { browserName: "webkit" } },
  ],
});
