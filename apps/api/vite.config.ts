import { cloudflare } from "@cloudflare/vite-plugin";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    cloudflare({
      persistState: {
        path:
          process.env.TABLECAST_STATE_PATH ?? resolve(import.meta.dirname, "../../.local/state"),
      },
      inspectorPort: false,
      remoteBindings: false,
      types: { includeRuntime: false },
    }),
  ],
});
