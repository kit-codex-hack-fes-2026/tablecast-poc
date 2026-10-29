import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig, defineProject } from "vitest/config";
import { prepareTablecastSeedPreview } from "./.storybook/tablecast-seed-config.ts";
import { tablecastLogoFixture } from "./src/test-support/tablecast-logo-fixture.ts";

const seedPreview = prepareTablecastSeedPreview();
const preview = {
  publicDir: seedPreview.directory,
  define: { TABLECAST_SEED_PREVIEW: seedPreview.data },
};

const performanceTests = ["src/features/kiosk/kiosk-performance.browser.test.tsx"];

// DOM応答の計測へ別画面のマウント負荷を混ぜず、既存の100ms予算で後段に測る。
const browser = (performance = false) =>
  defineProject({
    ...preview,
    resolve: { dedupe: ["react", "react-dom"] },
    optimizeDeps: {
      exclude: ["cloudflare:workers", "@tanstack/react-start/server"],
      include: [
        "@base-ui/react/popover",
        "@base-ui/react/tooltip",
        "@tablecast/api > css-tree/parser",
        "@tablecast/api > css-tree/generator",
        "react",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "vitest-browser-react",
        "@tanstack/react-query",
        "@tablecast/api > hono/client",
        "lucide-react",
        "fumadocs-core/search/client/fetch",
        "fumadocs-core/search/client",
        "fumadocs-core/utils/hast-to-jsx",
        "@zbsearch/tokenizers/japanese",
        "zbsearch/components",
        "qrcode.react",
        "qr-scanner",
        "react-resizable-panels",
        "tailwind-variants",
        "@unpic/react/base",
        "@unpic/placeholder",
        "zod",
        "@paper-design/shaders-react",
        "motion",
        "motion/react",
        "motion/react-m",
        "@tanstack/react-table",
        "@base-ui/react/avatar",
        "@base-ui/react/button",
        "@base-ui/react/checkbox",
        "@base-ui/react/collapsible",
        "@base-ui/react/dialog",
        "@base-ui/react/input",
        "@base-ui/react/number-field",
        "@base-ui/react/menu",
        "@base-ui/react/merge-props",
        "@base-ui/react/select",
        "@base-ui/react/use-render",
        "@better-auth/infra/client",
        "@better-auth/oauth-provider/client",
        "@better-auth/passkey/client",
        "@better-auth/stripe/client",
        "better-auth/client/plugins",
        "better-auth/react",
      ],
    },
    plugins: [
      tanstackStart({ vite: { installDevServerMiddleware: false } }),
      react(),
      tailwindcss(),
    ],
    test: {
      name: performance ? "browser-performance" : "browser",
      maxWorkers: performance ? 1 : 2,
      include: performance ? performanceTests : ["src/**/*.browser.test.tsx"],
      exclude: performance ? [] : performanceTests,
      sequence: { groupOrder: performance ? 1 : 0 },
      browser: {
        screenshotDirectory: "test-results/browser",
        commands: { tablecastLogoFixture },
        screenshotFailures: true,
        enabled: true,
        headless: true,
        provider: playwright(),
        instances: performance
          ? [{ browser: "chromium" }]
          : [
              { browser: "chromium" },
              {
                browser: "chromium",
                name: "chromium-reduced-motion",
                provider: playwright({ contextOptions: { reducedMotion: "reduce" } }),
                include: [
                  "src/features/shell/admin-shell.browser.test.tsx",
                  "src/features/floor/floor-timeline.browser.test.tsx",
                  "src/features/floor/floor-calendar-layout.browser.test.tsx",
                  "src/features/kiosk/voice-panel.browser.test.tsx",
                  "src/features/kiosk/voice-panel-video.browser.test.tsx",
                  "src/features/kiosk/voice-pane-ui.browser.test.tsx",
                  "src/features/kiosk/voice-service-ui.browser.test.tsx",
                  "src/features/kiosk/local-camera-reading.browser.test.tsx",
                  "src/components/motion-system.browser.test.tsx",
                  "src/components/product-image.browser.test.tsx",
                  "src/components/route-motion.browser.test.tsx",
                ],
              },
              {
                browser: "webkit",
                provider: playwright({ contextOptions: { permissions: ["camera"] } }),
                include: [
                  "src/features/devices/device-qr-reader.browser.test.tsx",
                  "src/features/devices/devices.browser.test.tsx",
                  "src/features/floor/floor-timeline.browser.test.tsx",
                  "src/features/floor/floor-calendar-layout.browser.test.tsx",
                  "src/features/shell/admin-shell.browser.test.tsx",
                  "src/features/shell/sidebar-preferences.browser.test.tsx",
                  "src/features/shell/sidebar-search.browser.test.tsx",
                  "src/components/month-picker.browser.test.tsx",
                  "src/components/date-picker.browser.test.tsx",
                  "src/components/design-system.browser.test.tsx",
                  "src/components/motion-system.browser.test.tsx",
                  "src/components/route-motion.browser.test.tsx",
                  "src/features/account/email-access.browser.test.tsx",
                  "src/features/kiosk/store-theme.browser.test.tsx",
                  "src/features/kiosk/kiosk.browser.test.tsx",
                  "src/features/kiosk/kiosk-layout.browser.test.tsx",
                  "src/features/kiosk/kiosk-seed-preview.browser.test.tsx",
                  "src/features/kiosk/kiosk-voice.browser.test.tsx",
                  "src/features/kiosk/kiosk-realtime.browser.test.tsx",
                  "src/features/kiosk/menu-search.browser.test.tsx",
                  "src/features/kiosk/staff-assistance.browser.test.tsx",
                  "src/features/kiosk/local-camera.browser.test.tsx",
                  "src/features/kiosk/local-camera-reading.browser.test.tsx",
                  "src/features/kiosk/voice-reference.browser.test.tsx",
                  "src/features/kiosk/voice-journey.browser.test.tsx",
                  "src/features/kiosk/voice-pane-ui.browser.test.tsx",
                  "src/features/kiosk/voice-service-ui.browser.test.tsx",
                  "src/components/product-image.browser.test.tsx",
                  "src/components/game-frame.browser.test.tsx",
                  "src/components/menu-option-image.browser.test.tsx",
                ],
              },
            ],
      },
    },
  });

export default defineConfig({
  test: {
    attachmentsDir: "test-results/attachments",
    projects: [
      { test: { name: "unit", include: ["src/**/*.test.ts"], environment: "node" } },
      browser(),
      browser(true),
      {
        ...preview,
        resolve: { dedupe: ["react", "react-dom"] },
        optimizeDeps: {
          exclude: ["cloudflare:workers", "@tanstack/react-start/server"],
          include: [
            "@base-ui/react/popover",
            "@base-ui/react/tooltip",
            "@base-ui/react/number-field",
            "react",
            "react-dom/client",
            "react/jsx-runtime",
            "react/jsx-dev-runtime",
            "qrcode.react",
            "@paper-design/shaders-react",
            "motion",
            "@better-auth/infra/client",
            "@better-auth/stripe/client",
          ],
        },
        plugins: [tailwindcss(), storybookTest({ configDir: "./.storybook" })],
        test: {
          name: "storybook",
          maxWorkers: 2,
          browser: {
            screenshotDirectory: "test-results/browser",
            screenshotFailures: true,
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
