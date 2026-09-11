import { cloudflare } from "@cloudflare/vite-plugin";
import { join } from "node:path";
import process from "node:process";
import { defineConfig } from "vite";
import { z } from "zod";

const env = z
  .object({
    TABLECAST_E2E_CASE_DIRECTORY: z.string(),
  })
  .parse(process.env);

// build済みのWeb/APIをcase専用のrootとstorageでpreviewする。
export default defineConfig({
  root: env.TABLECAST_E2E_CASE_DIRECTORY,
  plugins: [
    cloudflare({
      persistState: { path: join(env.TABLECAST_E2E_CASE_DIRECTORY, "state") },
      inspectorPort: false,
      remoteBindings: false,
    }),
  ],
});
