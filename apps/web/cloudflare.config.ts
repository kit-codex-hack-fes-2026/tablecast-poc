import { defineConfig } from "cf/config";
import { webCloudflareConfig, modeOptions } from "../../scripts/tablecast-cloudflare-config.ts";

export default defineConfig(({ mode }) => {
  const options = modeOptions(process.env.TABLECAST_WEB_CONFIG, mode);
  return webCloudflareConfig({
    ...options,
    name: process.env.TABLECAST_WEB_CONFIG ? options.name : "tablecast-web",
  });
});
