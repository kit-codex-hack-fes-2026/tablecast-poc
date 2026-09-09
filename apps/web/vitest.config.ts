import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    attachmentsDir: "test-results/attachments",
    projects: [
      { test: { name: "unit", include: ["src/**/*.test.ts"], environment: "node" } },
      {
        plugins: [react(), tailwindcss()],
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.tsx"],
          browser: {
            screenshotDirectory: "test-results/browser",
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [
              { browser: "chromium" },
              {
                browser: "webkit",
                include: ["src/features/store/device-qr-reader.browser.test.tsx"],
              },
            ],
          },
        },
      },
      {
        plugins: [storybookTest({ configDir: "./.storybook" })],
        test: {
          name: "storybook",
          browser: {
            screenshotDirectory: "test-results/browser",
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
