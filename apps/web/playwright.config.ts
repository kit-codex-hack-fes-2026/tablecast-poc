import { z } from "zod";
import { readFileSync } from "node:fs";
import { defineConfig } from "@playwright/test";

const runtime = z
  .object({ origin: z.string() })
  .parse(JSON.parse(readFileSync(new URL("../../.local/runtime.json", import.meta.url), "utf8")));

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: process.env.TABLECAST_E2E_ORIGIN ?? runtime.origin,
    viewport: { width: 1024, height: 768 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "tablecast-chromium", use: { browserName: "chromium" } },
    { name: "tablecast-webkit", use: { browserName: "webkit" } },
  ],
});
