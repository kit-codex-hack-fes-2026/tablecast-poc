import { defineConfig } from "oxlint";
import rootConfig from "../../oxlint.config.ts";

export default defineConfig({
  extends: [rootConfig],
  jsPlugins: [
    { name: "drizzle", specifier: "eslint-plugin-drizzle" },
    { name: "hono", specifier: "eslint-plugin-hono" },
  ],
  rules: {
    "drizzle/enforce-delete-with-where": ["error", { drizzleObjectName: ["db"] }],
    "drizzle/enforce-update-with-where": ["error", { drizzleObjectName: ["db"] }],
    "hono/param-name-mismatch": "error",
    "hono/no-multiple-next": "error",
    "hono/no-unused-context-response": "error",
    "hono/no-process-env": "error",
    "hono/global-middleware-placement": "error",
  },
});
