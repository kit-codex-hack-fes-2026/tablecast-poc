import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => {
  const localConfig = command === "serve" || process.env.TABLECAST_LOCAL_BUILD === "1";
  return {
    plugins: [
      tailwindcss(),
      cloudflare({
        configPath: localConfig ? process.env.TABLECAST_WEB_CONFIG : undefined,
        viteEnvironment: { name: "ssr" },
        auxiliaryWorkers: [
          {
            configPath: localConfig
              ? (process.env.TABLECAST_API_CONFIG ?? "../api/wrangler.jsonc")
              : "../api/wrangler.jsonc",
            viteEnvironment: { name: "tablecast_api" },
          },
        ],
        ...(process.env.TABLECAST_STATE_PATH
          ? { persistState: { path: process.env.TABLECAST_STATE_PATH } }
          : {}),
        ...(process.env.TABLECAST_INSPECTOR_PORT
          ? { inspectorPort: Number(process.env.TABLECAST_INSPECTOR_PORT) }
          : {}),
      }),
      paraglideVitePlugin({
        project: "./project.inlang",
        outdir: "./src/paraglide",
        strategy: ["cookie", "baseLocale"],
        cookieName: "tablecast_locale",
      }),
      tanstackStart(),
      react(),
    ],
    server: {
      host: "127.0.0.1",
      allowedHosts: [
        ".localhost",
        ...(process.env.TABLECAST_PUBLIC_ORIGIN
          ? [new URL(process.env.TABLECAST_PUBLIC_ORIGIN).hostname]
          : []),
      ],
      strictPort: true,
    },
  };
});
