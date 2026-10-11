import { execFileSync } from "node:child_process";
import { cp, readdir, rm } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { readBuildOutput } from "@cloudflare/build-output-utils";
import { modeOptions } from "./tablecast-deploy-config";

const root = resolve(import.meta.dirname, "..");

// 各workspaceの公式buildを集め、previewと配備で同じWeb/APIの成果物を使う。
export async function buildTablecast(
  environment: Record<string, string | undefined> = process.env,
) {
  const mode = modeOptions(
    "api",
    environment.TABLECAST_MODE,
    environment.TABLECAST_CONFIG,
    environment,
  ).environment;
  // cf beta.14はTanStack Startへ--modeを転送しないため、Webはpackage scriptでViteへ渡す。
  execFileSync(
    "bun",
    [
      "--no-env-file",
      "x",
      "--no-install",
      "turbo",
      "run",
      "build",
      "--filter=@tablecast/web",
      ...(environment.TABLECAST_LOCAL_BUILD ? ["--cache=local:r"] : []),
    ],
    {
      cwd: root,
      env: { ...process.env, ...environment, TABLECAST_MODE: mode },
      stdio: "inherit",
    },
  );
  const api = await readBuildOutput(resolve(root, "apps/api"));
  const webRoot = resolve(root, "apps/web");
  const web = await readBuildOutput(webRoot);
  await rm(resolve(webRoot, ".cloudflare/output/v0/workers/tablecast_api"), {
    recursive: true,
    force: true,
  });
  await rm(resolve(webRoot, ".cloudflare/output/v0/containers"), { recursive: true, force: true });
  await cp(
    dirname(api.workers.default.configPath),
    resolve(webRoot, ".cloudflare/output/v0/workers/tablecast_api"),
    { recursive: true },
  );
  for (const container of api.containers)
    await cp(
      dirname(container.configPath),
      resolve(webRoot, ".cloudflare/output/v0/containers", container.config.name),
      { recursive: true },
    );
  if (["preview", "staging", "production"].includes(mode)) {
    // 公式Vite pluginがpreview用に生成するdotenvはCI成果物へ含めない。
    const output = resolve(webRoot, ".cloudflare/output");
    for (const path of await readdir(output, { recursive: true }))
      if (
        path.split("/").at(-1)?.startsWith(".dev.vars") ||
        path.split("/").at(-1)?.startsWith(".env")
      )
        await rm(resolve(output, path), { force: true });
  }
  // SerwistはViteの全environment終了後に生成するため、Build Outputのassetsにも反映する。
  if (!web.workers.default.assetsDir) throw new Error("Webの静的assetsがありません。");
  if (environment.TABLECAST_BUILD_DIRECTORY)
    await cp(
      resolve(webRoot, ".cloudflare"),
      resolve(environment.TABLECAST_BUILD_DIRECTORY, ".cloudflare"),
      { recursive: true },
    );
}

if (import.meta.main) await buildTablecast();
