import { createApi, createContext, main as serwist } from "@serwist/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import process from "node:process";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { z } from "zod";

export default defineConfig(() => {
  const tablecastEnv = z.record(z.string(), z.string().optional()).parse({ ...process.env });
  const buildDirectory = resolve(
    import.meta.dirname,
    tablecastEnv.TABLECAST_BUILD_DIRECTORY ?? "dist",
  );
  const assetsDirectory = resolve(
    import.meta.dirname,
    ".cloudflare/output/v0/workers/default/assets",
  );
  const serviceWorkerContext = createContext(
    {
      swSrc: "src/sw.ts",
      swDest: resolve(assetsDirectory, "sw.js"),
      globDirectory: assetsDirectory,
      globPatterns: [
        "assets/**/*.{js,css,woff2}",
        "flags/*.svg",
        "icons/*.png",
        "brand/*.{svg,png}",
        "favicon.{svg,ico}",
        "offline.html",
      ],
      injectionPoint: "self.tablecastPrecacheManifest",
      rollupFormat: "iife",
    },
    undefined,
  );
  const serviceWorkerApi = createApi(serviceWorkerContext);
  return {
    build: { minify: true, outDir: buildDirectory },
    cacheDir: tablecastEnv.TABLECAST_VITE_CACHE_DIR,
    resolve: { dedupe: ["react", "react-dom"] },
    plugins: [
      tailwindcss(),
      cloudflare({
        experimental: { newConfig: { cfBuildOutput: true, types: { includeRuntime: false } } },
        viteEnvironment: { name: "ssr" },
        ...(tablecastEnv.TABLECAST_STATE_PATH
          ? { persistState: { path: resolve(tablecastEnv.TABLECAST_STATE_PATH, "tablecast-web") } }
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
      serwist(serviceWorkerContext, serviceWorkerApi),
      {
        name: "tablecast-pwa-build",
        apply: "build",
        buildApp: { order: "post", handler: () => serviceWorkerApi.generateSW() },
      },
    ],
    preview: {
      host: tablecastEnv.HOST ?? "127.0.0.1",
      port: Number(tablecastEnv.PORT ?? 4173),
      strictPort: true,
    },
    server: {
      host: tablecastEnv.HOST ?? "127.0.0.1",
      port: Number(tablecastEnv.PORT ?? 5173),
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
