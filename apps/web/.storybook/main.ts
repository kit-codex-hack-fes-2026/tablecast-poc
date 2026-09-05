import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.tsx"],
  framework: {
    name: "@storybook/react-vite",
    options: { builder: { viteConfigPath: ".storybook/vite.config.ts" } },
  },
  addons: ["@storybook/addon-a11y", "@storybook/addon-vitest"],
  viteFinal(viteConfig) {
    return { ...viteConfig, server: { ...viteConfig.server, host: "127.0.0.1" } };
  },
};
export default config;
