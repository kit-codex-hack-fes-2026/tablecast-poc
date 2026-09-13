import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { catalogRelease } from "./tablecast-catalog-config";

const workspace = resolve(import.meta.dirname, "../apps/email-preview");
const directory = resolve(workspace, ".react-email");
const cli = (name: string, args: string[], cwd = directory) =>
  execFileSync(resolve(workspace, "node_modules/.bin", name), args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", WRANGLER_SEND_METRICS: "false" },
  });

await rm(directory, { recursive: true, force: true });
cli("email", ["build", "--prepare", "--dir", "emails"], workspace);
// 公式が生成した設定を標準のNext設定で拡張する。UIソースの変更はBun patchに限定する。
await cp(resolve(directory, "next.config.mjs"), resolve(directory, "tablecast-next-base.mjs"));
await writeFile(
  resolve(directory, "next.config.mjs"),
  `import config from './tablecast-next-base.mjs';\nexport default {...config, images: {...config.images, unoptimized: true}};\n`,
);
await writeFile(
  resolve(directory, "open-next.config.ts"),
  `import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import staticAssetsIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache';
export default defineCloudflareConfig({ incrementalCache: staticAssetsIncrementalCache, enableCacheInterception: true });\n`,
);
await writeFile(
  resolve(directory, "wrangler.json"),
  JSON.stringify({
    name: "tablecast-email-build",
    main: "tablecast-worker.js",
    compatibility_date: "2026-09-03",
    compatibility_flags: ["nodejs_compat"],
    workers_dev: false,
    preview_urls: false,
    assets: { directory: ".open-next/assets", binding: "ASSETS", run_worker_first: true },
  }),
);
cli("opennextjs-cloudflare", ["build"]);
cli("opennextjs-cloudflare", ["populateCache", "local"]);
const manifest = z
  .object({ routes: z.record(z.string(), z.unknown()) })
  .parse(JSON.parse(await readFile(resolve(directory, ".next/prerender-manifest.json"), "utf8")));
const paths = Object.keys(manifest.routes).filter(
  (path) => path === "/" || path.startsWith("/preview/"),
);
if (!paths.includes("/") || paths.length < 2)
  throw new Error("メール一覧と事前生成ページがありません。");
await writeFile(resolve(directory, "tablecast-routes.json"), JSON.stringify(paths));
await cp(
  resolve(workspace, "tablecast-email-worker.ts"),
  resolve(directory, "tablecast-email-worker.ts"),
);
await writeFile(
  resolve(directory, "tablecast-worker.js"),
  `import nextWorker from './.open-next/worker.js';
import {emailResponse} from './tablecast-email-worker.ts';
import routes from './tablecast-routes.json';
const paths = new Set(routes);
export default {fetch(request, env, ctx) { return emailResponse(request, paths, request => env.ASSETS.fetch(request), request => nextWorker.fetch(request, env, ctx)); }};\n`,
);
const staticFiles = await readdir(resolve(directory, ".open-next/assets/_next/static"), {
  recursive: true,
});
const script = staticFiles.find((path) => path.endsWith(".js"));
if (!script) throw new Error("メールの静的JSがありません。");
const release = catalogRelease("email", [...paths, `/_next/static/${script}`]);
await mkdir(resolve(directory, ".open-next/assets/_tablecast"), { recursive: true });
await writeFile(
  resolve(directory, ".open-next/assets/_tablecast/release.json"),
  JSON.stringify(release),
);
await writeFile(resolve(directory, "tablecast-release.json"), JSON.stringify(release));
console.info(`メールカタログ生成済み: ${paths.length}ページ (${release.sha})`);
