import { readBuildOutput } from "@cloudflare/build-output-utils";
import { execFileSync } from "node:child_process";
import { copyFile, cp, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { cleanBuild } from "./tablecast-clean-build.ts";
import { modeOptions } from "./tablecast-deploy-config.ts";
import { readSeedTemplate } from "./tablecast-seed-template.ts";

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
  if (mode !== "production") {
    const prepareSeed = (force = false) =>
      execFileSync(
        "bun",
        [
          "--no-env-file",
          "x",
          "--no-install",
          "turbo",
          "run",
          "seed:template",
          ...(force ? ["--force"] : []),
        ],
        {
          cwd: root,
          stdio: "inherit",
        },
      );
    prepareSeed();
    try {
      await readSeedTemplate();
    } catch {
      console.warn("固定seedのcacheが不正なため、一度だけ再生成します。");
      prepareSeed(true);
      await readSeedTemplate();
    }
  }
  // cfはTanStack Startへ--modeを転送しないため、Webはpackage scriptでViteへ渡す。
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
  await cleanBuild(webRoot, mode);
  // SerwistはViteの全environment終了後に生成するため、Build Outputのassetsにも反映する。
  if (!web.workers.default.assetsDir) throw new Error("Webの静的assetsがありません。");
  // 同じSHAのWorkers成果物へ同梱し、seed専用の取得stepを増やさない。
  const seedArtifact = resolve(webRoot, ".cloudflare/output/tablecast-seed.json");
  if (mode === "production") await rm(seedArtifact, { force: true });
  else await copyFile(resolve(root, ".local/tablecast-seed-template/seed.json"), seedArtifact);
  if (environment.TABLECAST_BUILD_DIRECTORY)
    await cp(
      resolve(webRoot, ".cloudflare"),
      resolve(environment.TABLECAST_BUILD_DIRECTORY, ".cloudflare"),
      { recursive: true },
    );
}

if (import.meta.main) await buildTablecast();
