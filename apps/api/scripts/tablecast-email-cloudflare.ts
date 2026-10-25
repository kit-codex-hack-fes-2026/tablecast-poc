import { rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { catalogTarget } from "../../../scripts/tablecast-catalog-config.ts";
import {
  tablecastAccountId,
  tablecastCompatibilityDate,
} from "../../../scripts/tablecast-deploy-config.ts";

const preview = resolve(import.meta.dirname, "../.react-email");
// NextとOpenNextのrootを生成アプリへ揃え、repoの.env.localを配信成果物へ含めない。
await rename(resolve(preview, "next.config.mjs"), resolve(preview, "tablecast-next.config.mjs"));
await writeFile(
  resolve(preview, "next.config.mjs"),
  'import config from "./tablecast-next.config.mjs";\nexport default { ...config, turbopack: { ...config.turbopack, root: import.meta.dirname }, outputFileTracingRoot: import.meta.dirname };\n',
);
const name = process.env.TABLECAST_PR_NUMBER
  ? catalogTarget(process.env.TABLECAST_PR_NUMBER, "email").name
  : "tablecast-email-preview";
await writeFile(
  resolve(preview, "../.local/tablecast-email.wrangler.json"),
  JSON.stringify({
    name,
    account_id: tablecastAccountId,
    main: resolve(preview, ".open-next/worker.js"),
    compatibility_date: tablecastCompatibilityDate,
    compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"],
    workers_dev: false,
    preview_urls: false,
    observability: { enabled: true, traces: { enabled: true } },
    assets: { directory: resolve(preview, ".open-next/assets"), binding: "ASSETS" },
    services: [{ binding: "WORKER_SELF_REFERENCE", service: name }],
    images: { binding: "IMAGES" },
  }),
);
