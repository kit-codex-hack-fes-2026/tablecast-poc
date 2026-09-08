import process from "node:process";
import { z } from "zod";
import { defineConfig } from "@playwright/test";
import { runtime } from "./e2e/support/runtime";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: z.string().optional().parse(process.env.TABLECAST_E2E_ORIGIN) ?? runtime.origin,
    viewport: { width: 1024, height: 768 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "tablecast-chromium", use: { browserName: "chromium" } },
    { name: "tablecast-webkit", use: { browserName: "webkit" } },
  ],
});
