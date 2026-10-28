import type { StorybookConfig } from "@storybook/tanstack-react";
import remarkGfm from "remark-gfm";
import { prepareTablecastSeedPreview } from "./tablecast-seed-config.ts";

const seedPreview = prepareTablecastSeedPreview();

const config: StorybookConfig = {
  staticDirs: [seedPreview.directory],
  stories: ["../src/**/*.mdx", "../src/**/*.stories.tsx"],
  framework: {
    name: "@storybook/tanstack-react",
    options: { builder: { viteConfigPath: ".storybook/vite.config.ts" } },
  },
  addons: [
    {
      name: "@storybook/addon-docs",
      options: { mdxPluginOptions: { mdxCompileOptions: { remarkPlugins: [remarkGfm] } } },
    },
    "@storybook/addon-a11y",
    "@storybook/addon-vitest",
    "@storybook/addon-mcp",
  ],
  features: { componentsManifest: true },
  typescript: {
    reactDocgen: "react-docgen-typescript",
    reactDocgenTypescriptOptions: { shouldExtractLiteralValuesFromEnum: true },
  },
  viteFinal(viteConfig) {
    return { ...viteConfig, server: { ...viteConfig.server, host: "127.0.0.1" } };
  },
};
export default config;
