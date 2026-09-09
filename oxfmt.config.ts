import { defineConfig } from "oxfmt";

export default defineConfig({
  printWidth: 100,
  ignorePatterns: [
    "bun.lock",
    ".agents/skills/animate/**",
    ".agents/skills/emil-design-eng/**",
    ".agents/skills/mastra/**",
    "**/uv.lock",
    "**/dist/**",
    "**/storybook-static/**",
    "**/worker-configuration.d.ts",
    "**/src/cloudflare-env.d.ts",
    "**/src/routeTree.gen.ts",
    "**/src/paraglide/**",
    "**/.wrangler/**",
    "**/.local/**",
    "**/.venv/**",
    "**/.turbo/**",
  ],
});
