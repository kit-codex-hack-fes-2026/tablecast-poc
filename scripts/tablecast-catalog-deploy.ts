import { writeAssets, writeRootConfig, writeWorkerConfig } from "@cloudflare/build-output-utils";
import { InputWorkerSchema } from "@cloudflare/config";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import {
  type CatalogKind,
  catalogKinds,
  catalogRelease,
  catalogReleaseSchema,
  catalogTarget,
} from "./tablecast-catalog-config.ts";
import { cloudflare, currentRevision } from "./tablecast-deploy-api.ts";
import { deploymentTarget, tablecastAccountId } from "./tablecast-deploy-config.ts";
import {
  applications,
  ownedCatalogApplication,
  protect,
} from "./tablecast-deploy/catalog-access.ts";

const root = resolve(import.meta.dirname, "..");

const workerSchema = z.object({ id: z.string(), name: z.string() });

async function assertCatalogSubdomain(name: string, kind: CatalogKind) {
  const subdomain = z
    .object({ enabled: z.boolean(), previews_enabled: z.boolean() })
    .parse(await cloudflare(`workers/scripts/${name}/subdomain`));
  console.info(
    `${kind}: workers.dev enabled=${subdomain.enabled}, previews_enabled=${subdomain.previews_enabled}`,
  );
  if (!subdomain.enabled || subdomain.previews_enabled)
    throw new Error(`${kind}のworkers.dev公開設定が一致しません。`);
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
    if (exists && !app)
      throw new Error(
        "カタログWorkerの所有Access applicationがありません。自動削除せず照合してください。",
      );
    await currentRevision(target, "", true);
    if (exists)
      execFileSync(
        "node",
        [resolve(root, "node_modules/cf/bin/cf"), "workers", "delete", name, "--force"],
        {
          cwd: root,
          stdio: "inherit",
          env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: tablecastAccountId },
        },
      );
    if (app) await cloudflare(`access/apps/${app.id}`, "DELETE", undefined, true);
  }
}

async function inspectCatalog(origin: string, pr: string, kind: CatalogKind) {
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
  if (!response.ok) {
    const errorCode =
      response.status === 404
        ? (await response.text()).match(/\berror code:\s*(\d+)\b/i)?.[1]
        : undefined;
    if (!response.bodyUsed) await response.body?.cancel();
    throw new Error(
      `カタログのreleaseを取得できません: HTTP ${response.status}${errorCode ? ` (Cloudflare error code: ${errorCode})` : ""}`,
    );
  }
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

async function prepareCatalog(kind: CatalogKind) {
  const email = kind === "email";
  const directory = resolve(
    root,
    email ? "apps/api/.react-email/.open-next/assets" : "apps/web/storybook-static",
  );
  const files = await readdir(directory, { recursive: true });
  const script = files.find((path) => path.endsWith(".js"));
  if (!script) throw new Error("カタログの静的JSがありません。");
  const routes = email
    ? Object.keys(
        z
          .object({ routes: z.record(z.string(), z.unknown()) })
          .parse(
            JSON.parse(
              await readFile(
                resolve(root, "apps/api/.react-email/.next/prerender-manifest.json"),
                "utf8",
              ),
            ),
          ).routes,
      ).filter((path) => path.startsWith("/preview/"))
    : [];
  if (email && !routes.includes("/preview/invitation-ja"))
    throw new Error("招待メールの公式プレビューがありません。");
  const release = email
    ? catalogRelease("email", ["/", ...routes, `/${script}`])
    : catalogRelease("storybook", ["/", "/iframe.html", "/index.json", `/${script}`]);
  await mkdir(resolve(directory, "_tablecast"), { recursive: true });
  await writeFile(resolve(directory, "_tablecast/release.json"), JSON.stringify(release));
  await writeFile(resolve(directory, "_headers"), "/*\n  Cache-Control: no-store\n");
  await writeFile(
    resolve(directory, "_redirects"),
    email
      ? routes.map((path) => `/${path.slice("/preview/".length)}.html ${path} 302\n`).join("")
      : "/ /index.html 200\n",
  );
}

async function main() {
  const pr = process.env.TABLECAST_PR_NUMBER || "";
  if (process.argv.includes("--cleanup")) return cleanupCatalogs(pr);
  if (process.argv.includes("--prepare-storybook")) return prepareCatalog("storybook");
  if (process.argv.includes("--prepare-email")) return prepareCatalog("email");
  const sha = z
    .string()
    .regex(/^[a-f0-9]{40}$/)
    .parse(process.env.TABLECAST_RELEASE_SHA);
  const target = deploymentTarget(pr);
  await currentRevision(target, sha);
  const requestedKind = z
    .enum(["all", ...catalogKinds])
    .parse(process.env.TABLECAST_CATALOG_KIND ?? "all");
  const selectedKinds = requestedKind === "all" ? catalogKinds : [requestedKind];
  const directory = resolve(root, ".local/tablecast-catalog");
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, "empty.env"), "");
  const results = await Promise.allSettled(
    selectedKinds.map(async (kind) => {
      const { name, origin } = catalogTarget(pr, kind);
      const artifact =
        kind === "email"
          ? resolve(root, "apps/api/.react-email/.open-next/assets")
          : resolve(root, "apps/web/storybook-static");
      if (kind === "email") await prepareCatalog(kind);
      const releasePath = "_tablecast/release.json";
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
      const catalogRoot = resolve(directory, kind);
      const emailConfig = resolve(root, "apps/api/.local/tablecast-email.wrangler.json");
      if (kind === "email") {
        const config = z
          .looseObject({ name: z.literal(name) })
          .parse(JSON.parse(await readFile(emailConfig, "utf8")));
        await writeFile(emailConfig, JSON.stringify({ ...config, workers_dev: Boolean(existing) }));
      } else {
        await writeAssets({ root: catalogRoot, sourceDirectory: artifact });
        await writeWorkerConfig({
          root: catalogRoot,
          config: InputWorkerSchema.parse({
            assets: { notFoundHandling: "none", htmlHandling: "none" },
            name,
            compatibilityDate: "2026-09-03",
            // 既存Workerは事前にWorker単位のAccess保護を照合済みなので公開経路を維持する。
            workersDev: Boolean(existing),
            previewUrls: false,
          }),
        });
        await writeRootConfig(
          catalogRoot,
          { accountId: tablecastAccountId },
          { mode: "preview", isPreview: false },
        );
      }
      const child = spawn(
        "node",
        kind === "email"
          ? [
              resolve(root, "apps/api/node_modules/@opennextjs/cloudflare/dist/cli/index.js"),
              "deploy",
              "--config",
              emailConfig,
            ]
          : [resolve(root, "node_modules/cf/bin/cf"), "deploy", "--prebuilt", "--mode", "preview"],
        {
          cwd: kind === "email" ? resolve(root, "apps/api/.react-email") : catalogRoot,
          stdio: "inherit",
          env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: tablecastAccountId },
        },
      );
      await once(child, "close");
      if (child.exitCode !== 0) throw new Error(`${kind}の配備コマンドが失敗しました。`);
      const worker = workerSchema.parse(await cloudflare(`workers/workers/${name}`));
      if (worker.name !== name) throw new Error("Worker名が一致しません。");
      await protect(name, new URL(origin).hostname, worker.id);
      await currentRevision(target, sha);
      if (!existing)
        await cloudflare(`workers/scripts/${name}/subdomain`, "POST", {
          enabled: true,
          previews_enabled: false,
        });
      await assertCatalogSubdomain(name, kind);
      let verified = false;
      for (let attempt = 0; attempt < 12; attempt++) {
        try {
          verified = (await inspectCatalog(origin, pr, kind)).sha === sha;
        } catch (error) {
          const message =
            error instanceof Error && !error.message.includes("{")
              ? error.message
              : "カタログの応答を検証できません。";
          console.info(`${kind}: ${message}`);
        }
        if (verified) break;
        await new Promise((complete) => setTimeout(complete, 5000));
      }
      if (!verified) {
        await assertCatalogSubdomain(name, kind);
        throw new Error(`${kind}の公開SHA・Accessを確認できません。`);
      }
      console.info(`${kind}: ${origin} (${sha})`);
    }),
  );
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
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

export { ownedCatalogApplication } from "./tablecast-deploy/catalog-access.ts";
