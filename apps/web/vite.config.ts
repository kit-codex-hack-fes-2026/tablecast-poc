import { cloudflare } from "@cloudflare/vite-plugin";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import process from "node:process";
import { defineConfig } from "vite";
import { z } from "zod";

export default defineConfig(() => {
  const tablecastEnv = z.record(z.string(), z.string().optional()).parse({ ...process.env });
  return {
    cacheDir: tablecastEnv.TABLECAST_VITE_CACHE_DIR,
    resolve: { dedupe: ["react", "react-dom"] },
    plugins: [
      tailwindcss(),
      cloudflare({
        configPath: tablecastEnv.TABLECAST_WEB_CONFIG,
        viteEnvironment: { name: "ssr" },
        auxiliaryWorkers: [
          {
            configPath: tablecastEnv.TABLECAST_API_CONFIG ?? "../api/wrangler.jsonc",
            viteEnvironment: { name: "tablecast_api" },
          },
        ],
        ...(tablecastEnv.TABLECAST_STATE_PATH
          ? { persistState: { path: tablecastEnv.TABLECAST_STATE_PATH } }
          : {}),
        ...(tablecastEnv.TABLECAST_INSPECTOR_PORT
          ? { inspectorPort: Number(tablecastEnv.TABLECAST_INSPECTOR_PORT) }
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
        ...(tablecastEnv.TABLECAST_PUBLIC_ORIGIN
          ? [new URL(tablecastEnv.TABLECAST_PUBLIC_ORIGIN).hostname]
          : []),
      ],
      strictPort: true,
    },
  };
});
