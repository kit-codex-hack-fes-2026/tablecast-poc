import { cloudflare } from "@cloudflare/vite-plugin";
import { resolve } from "node:path";
import { z } from "zod";
import { defineConfig } from "vite";

// betaのpreviewはdefault Workerだけを起動する。APIも公式成果物を別rootで起動する。
export default defineConfig({
  root: resolve(import.meta.dirname, "../api"),
  plugins: [
    cloudflare({
      experimental: { newConfig: { cfBuildOutput: true, types: { generate: false } } },
      persistState: {
        path:
          z.string().optional().parse(process.env.TABLECAST_STATE_PATH) ??
          resolve(import.meta.dirname, "../../.local/state"),
      },
      inspectorPort: false,
      remoteBindings: false,
    }),
  ],
});
