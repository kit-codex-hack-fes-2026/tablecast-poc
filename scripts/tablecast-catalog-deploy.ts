import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { cloudflare, currentRevision } from "./tablecast-deploy-api";
import {
  catalogKinds,
  catalogRelease,
  catalogReleaseSchema,
  catalogTarget,
  type CatalogKind,
} from "./tablecast-catalog-config";
import { deploymentTarget, tablecastAccountId } from "./tablecast-deploy-config";

const root = resolve(import.meta.dirname, "..");
const appSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string().optional(),
  destinations: z
    .array(
      z.object({ type: z.string(), worker_id: z.string().optional(), uri: z.string().optional() }),
    )
    .optional(),
  policies: z.array(z.object({ id: z.string() })).optional(),
});
const workerSchema = z.object({ id: z.string(), name: z.string() });

async function applications() {
  const apps = z.array(appSchema).parse(await cloudflare("access/apps?per_page=1000"));
  if (apps.length >= 1000) throw new Error("Access一覧の上限に達しました。");
  return apps;
}

export function ownedCatalogApplication(
  app: z.infer<typeof appSchema>,
  name: string,
  domain: string,
  workerId?: string,
) {
  if (
    app.name !== name ||
    (app.domain !== domain &&
      !(
        workerId &&
        app.destinations?.length === 1 &&
        app.destinations[0]?.type === "worker" &&
        app.destinations[0]?.worker_id === workerId
      ))
  )
    throw new Error("カタログAccessの所有対象が一致しません。");
  if (
    app.destinations?.some(
      (value) =>
        !(value.type === "public" && value.uri === domain) &&
        !(value.type === "worker" && value.worker_id === workerId),
    )
  )
    throw new Error("他の対象を含むAccess applicationは変更できません。");
}

async function protect(name: string, domain: string, workerId?: string) {
  const app = (await applications()).find((value) => value.name === name);
  if (app) ownedCatalogApplication(app, name, domain, workerId);
  const policies = [
    process.env.TABLECAST_PREVIEW_ACCESS_POLICY_ID,
    process.env.TABLECAST_PREVIEW_SERVICE_POLICY_ID,
  ].map((value) => z.string().min(1).parse(value));
  const created = appSchema.parse(
    await cloudflare(`access/apps${app ? `/${app.id}` : ""}`, app ? "PUT" : "POST", {
      name,
      type: "self_hosted",
      session_duration: "24h",
      ...(workerId ? { destinations: [{ type: "worker", worker_id: workerId }] } : { domain }),
      policies: policies.map((id, index) => ({ id, precedence: index + 1 })),
    }),
  );
  const checked = appSchema.parse(await cloudflare(`access/apps/${created.id}`));
  ownedCatalogApplication(checked, name, domain, workerId);
  if (
    workerId &&
    !checked.destinations?.some((value) => value.type === "worker" && value.worker_id === workerId)
  )
    throw new Error("Worker単位のAccess保護を確認できません。");
  if (
    checked.policies?.length !== 2 ||
    !policies.every((id) => checked.policies?.some((value) => value.id === id))
  )
    throw new Error("Access policyを確認できません。");
}

export async function cleanupCatalogs(pr: string) {
  const target = deploymentTarget(pr);
  await currentRevision(target, "", true);
  const workers = z.array(z.object({ id: z.string() })).parse(await cloudflare("workers/scripts"));
  const apps = await applications();
  for (const kind of catalogKinds) {
    const { name, origin } = catalogTarget(pr, kind);
    const app = apps.find((value) => value.name === name);
    const exists = workers.some((value) => value.id === name);
    const worker = exists
      ? workerSchema.parse(await cloudflare(`workers/workers/${name}`))
      : undefined;
    // Workerが既に消えている場合も、専用名と唯一のWorker destination以外は採用しない。
    if (app)
      ownedCatalogApplication(
        app,
        name,
        new URL(origin).hostname,
        worker?.id ?? app.destinations?.find((value) => value.type === "worker")?.worker_id,
      );
    await currentRevision(target, "", true);
    if (exists) await cloudflare(`workers/scripts/${name}`, "DELETE", undefined, true);
    if (app) await cloudflare(`access/apps/${app.id}`, "DELETE", undefined, true);
  }
}

export async function inspectCatalog(origin: string, pr: string, kind: CatalogKind) {
  const headers = {
    "CF-Access-Client-Id": z.string().min(1).parse(process.env.CF_ACCESS_CLIENT_ID),
    "CF-Access-Client-Secret": z.string().min(1).parse(process.env.CF_ACCESS_CLIENT_SECRET),
  };
  const response = await fetch(`${origin}/_tablecast/release.json`, {
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`カタログのreleaseを取得できません: HTTP ${response.status}`);
  const release = catalogReleaseSchema.parse(await response.json());
  if (release.pr !== pr || release.kind !== kind)
    throw new Error("カタログの所有情報が一致しません。");
  for (const path of release.paths) {
    const page = await fetch(`${origin}${path}`, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });
    if (!page.ok) throw new Error(`カタログのページを確認できません: ${path} HTTP ${page.status}`);
    await page.body?.cancel();
    const denied = await fetch(`${origin}${path}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });
    const location = denied.headers.get("location");
    const accessLogin =
      location && new URL(location, origin).hostname.endsWith(".cloudflareaccess.com");
    if (!(denied.status === 403 || (denied.status === 302 && accessLogin)))
      throw new Error("未認証アクセスの拒否を確認できません。");
    await denied.body?.cancel();
  }
  return release;
}

async function main() {
  const pr = process.env.TABLECAST_PR_NUMBER || "";
  if (process.argv.includes("--cleanup")) return cleanupCatalogs(pr);
  if (process.argv.includes("--prepare-storybook")) {
    const directory = resolve(root, "apps/web/storybook-static");
    const files = await readdir(directory, { recursive: true });
    const script = files.find((path) => path.endsWith(".js"));
    if (!script) throw new Error("Storybookの静的JSがありません。");
    const release = catalogRelease("storybook", ["/", "/iframe.html", "/index.json", `/${script}`]);
    await mkdir(resolve(directory, "_tablecast"), { recursive: true });
    await writeFile(resolve(directory, "_tablecast/release.json"), JSON.stringify(release));
    await writeFile(resolve(directory, "_headers"), "/*\n  Cache-Control: no-store\n");
    return;
  }
  const sha = z
    .string()
    .regex(/^[a-f0-9]{40}$/)
    .parse(process.env.TABLECAST_RELEASE_SHA);
  const target = deploymentTarget(pr);
  await currentRevision(target, sha);
  const directory = resolve(root, ".local/tablecast-catalog");
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, "empty.env"), "");
  for (const kind of catalogKinds) {
    const { name, origin } = catalogTarget(pr, kind);
    const artifact =
      kind === "email"
        ? resolve(root, "apps/email-preview/.react-email")
        : resolve(root, "apps/web/storybook-static");
    const releasePath = kind === "email" ? "tablecast-release.json" : "_tablecast/release.json";
    const release = catalogReleaseSchema.parse(
      JSON.parse(await readFile(resolve(artifact, releasePath), "utf8")),
    );
    if (release.pr !== pr || release.sha !== sha || release.kind !== kind)
      throw new Error("成果物のPR・SHA・種別が一致しません。");
    const workers = z
      .array(z.object({ id: z.string() }))
      .parse(await cloudflare("workers/scripts"));
    const existing = workers.some((value) => value.id === name)
      ? workerSchema.parse(await cloudflare(`workers/workers/${name}`))
      : undefined;
    await protect(name, new URL(origin).hostname, existing?.id);
    await currentRevision(target, sha);
    const config =
      kind === "email"
        ? {
            main: resolve(artifact, "tablecast-worker.js"),
            compatibility_flags: ["nodejs_compat"],
            assets: {
              directory: resolve(artifact, ".open-next/assets"),
              binding: "ASSETS",
              run_worker_first: true,
            },
          }
        : { assets: { directory: artifact, not_found_handling: "none", html_handling: "none" } };
    const configPath = resolve(directory, `${kind}.json`);
    await writeFile(
      configPath,
      JSON.stringify({
        ...config,
        name,
        account_id: tablecastAccountId,
        compatibility_date: "2026-09-03",
        workers_dev: false,
        preview_urls: false,
      }),
    );
    execFileSync(
      resolve(root, "node_modules/.bin/wrangler"),
      ["deploy", "--config", configPath, "--env-file", resolve(directory, "empty.env")],
      { cwd: root, stdio: "inherit" },
    );
    const worker = workerSchema.parse(await cloudflare(`workers/workers/${name}`));
    if (worker.name !== name) throw new Error("Worker名が一致しません。");
    await protect(name, new URL(origin).hostname, worker.id);
    await currentRevision(target, sha);
    await cloudflare(`workers/scripts/${name}/subdomain`, "POST", {
      enabled: true,
      previews_enabled: false,
    });
    let verified = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        verified = (await inspectCatalog(origin, pr, kind)).sha === sha;
      } catch (error) {
        console.info(
          error instanceof Error && !error.message.includes("{")
            ? error.message
            : "カタログの応答を検証できません。",
        );
      }
      if (verified) break;
      await new Promise((complete) => setTimeout(complete, 5000));
    }
    if (!verified) throw new Error(`${kind}の公開SHA・Accessを確認できません。`);
    console.info(`${kind}: ${origin} (${sha})`);
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(
      error instanceof Error && !error.message.includes("{")
        ? error.message
        : "カタログ操作に失敗しました。対象SHA・Access・成果物を確認してください。",
    );
    process.exitCode = 1;
  }
}
