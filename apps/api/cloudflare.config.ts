import { defineConfig } from "cf/config";
import { apiCloudflareConfig, modeOptions } from "../../scripts/tablecast-cloudflare-config.ts";

export default defineConfig(({ mode }) =>
  apiCloudflareConfig(modeOptions(process.env.TABLECAST_API_CONFIG, mode)),
);
