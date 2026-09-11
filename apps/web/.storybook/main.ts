import type { StorybookConfig } from "@storybook/tanstack-react";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.tsx"],
  framework: {
    name: "@storybook/tanstack-react",
    options: { builder: { viteConfigPath: ".storybook/vite.config.ts" } },
  },
  addons: ["@storybook/addon-a11y", "@storybook/addon-vitest", "@storybook/addon-mcp"],
  features: { componentsManifest: true },
  viteFinal(viteConfig) {
    return { ...viteConfig, server: { ...viteConfig.server, host: "127.0.0.1" } };
  },
};
export default config;
