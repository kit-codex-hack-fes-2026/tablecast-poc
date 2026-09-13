import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const selected = process.env.TABLECAST_VIDEO_DIR;
const tablecast =
  !process.env.TABLECAST_PRESENTATION_PROJECT ||
  resolve(process.env.TABLECAST_PRESENTATION_PROJECT) ===
    resolve("projects/tablecast-main-rerecord.json");

export default defineConfig({
  testDir: "./scripts",
  testMatch: selected
    ? ["tablecast-layout.spec.ts"]
    : [
        "tablecast-layout.spec.ts",
        "tablecast-shot.spec.ts",
        "tablecast-workflow.spec.ts",
        "tablecast-render-contract.spec.ts",
      ],
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: process.env.TABLECAST_VIDEO_REPORT
    ? [["list"], ["json", { outputFile: process.env.TABLECAST_VIDEO_REPORT }]]
    : "list",
  outputDir: process.env.TABLECAST_VIDEO_REPORT
    ? `${process.env.TABLECAST_VIDEO_REPORT}-artifacts`
    : "output/layout-tests",
  use: {
    browserName: "chromium",
    channel: "chrome",
    viewport: { width: 1920, height: 1080 },
    launchOptions: { args: ["--allow-file-access-from-files"] },
    screenshot: "only-on-failure",
  },
  projects: selected
    ? [
        {
          name: process.env.TABLECAST_VIDEO_FILM ?? "selected",
          grepInvert: tablecast
            ? process.env.TABLECAST_VIDEO_FILM === "product"
              ? /@technical/
              : /@product/
            : /@tablecast/,
        },
      ]
    : [
        { name: "product", grepInvert: /@technical/ },
        { name: "technical", grepInvert: /@product/ },
      ],
});
