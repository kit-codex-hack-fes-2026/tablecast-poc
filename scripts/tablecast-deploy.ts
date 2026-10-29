import { readBuildOutput } from "@cloudflare/build-output-utils";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { getPlatformProxy } from "wrangler";
import { z } from "zod";
import { apiSdkConfiguration } from "../apps/api/cloudflare.config.ts";
import { buildTablecast } from "./tablecast-build.ts";
import { cloudflare, currentRevision, waitForRelease } from "./tablecast-deploy-api.ts";
import {
  bindDeploymentDatabase,
  deploymentBuildOutput,
  deploymentOptions,
  deploymentSecrets,
} from "./tablecast-deploy-config.ts";
import { cf } from "./tablecast-deploy/commands.ts";
import { syncPosWebhookAccess, verifyPosWebhookAccess } from "./tablecast-deploy/pos-access.ts";
import {
  accessApplication,
  resources,
  verifyDurableNamespaces,
} from "./tablecast-deploy/resources.ts";
import { directory, root, sha, target } from "./tablecast-deploy/runtime.ts";
import { prepareStorage } from "./tablecast-deploy/storage.ts";
import { verifyStaging } from "./tablecast-deploy/verify.ts";
import { assertWorkerOwner } from "./tablecast-infra-diff.ts";
import { readSeedTemplate } from "./tablecast-seed-template.ts";

async function main(resetFinished = false) {
  const reset = process.argv.includes("--reset") && !resetFinished;
  if (process.argv.includes("--reset") && process.argv.includes("--cleanup"))
    throw new Error("resetとcleanupは同時に指定できません。");
  const cleanup = process.argv.includes("--cleanup") || reset;
  if (cleanup && target.squareSandbox)
    throw new Error("固定Square SandboxはPR終了時のcleanup・resetでは削除できません。");
  if (
    reset &&
    (target.environment !== "staging" ||
      process.env.TABLECAST_RESET_CONFIRM !== "tablecast-staging")
  )
    throw new Error("staging専用リセットの確認がありません。");
  const plan = process.argv.includes("--plan");
  const build = process.argv.includes("--build");
  if (cleanup && !target.pr && !reset) throw new Error("本番資源はcleanupできません。");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(resolve(directory, "empty.env"), "", { mode: 0o600 });
  if (plan || build) {
    const options = deploymentOptions(
      target,
      sha,
      "11111111-1111-4111-8111-111111111111",
      process.env.TABLECAST_OTEL_CAPTURE_CONTENT ?? "true",
    );
    if (build)
      await buildTablecast({
        ...process.env,
        TABLECAST_CONFIG: JSON.stringify(options),
      });
    console.info(JSON.stringify({ mode: build ? "build" : "plan", ...target }));
    return;
  }
  // 同じrunのSHA付き成果物を、資源の作成・resetより先に検証する。
  const seedTemplate =
    target.emulate && (!cleanup || reset)
      ? await readSeedTemplate(resolve(root, "apps/web/.cloudflare/output/tablecast-seed.json"))
      : undefined;
  await currentRevision(target, sha, cleanup && !reset);
  const secrets = cleanup && !reset ? undefined : deploymentSecrets(target, { ...process.env });
  // 資源変更前に、CI成果物が対象環境・SHAのものか確認する。
  let outputConfigs: Awaited<ReturnType<typeof readBuildOutput>>["workers"][string][] = [];
  if (!cleanup || reset) {
    outputConfigs = deploymentBuildOutput(
      await readBuildOutput(resolve(root, "apps/web")),
      target,
      sha,
    );
  }
  const [existingStorage, existingNamespaces, workerList] = await Promise.all([
    resources(false),
    verifyDurableNamespaces(),
    cloudflare("workers/scripts"),
  ]);
  const workers = z.array(z.object({ id: z.string() })).parse(workerList);
  await Promise.all(
    [target.api, target.web]
      .filter((name) => workers.some((worker) => worker.id === name))
      .map(async (name) => {
        const actual = z
          .record(z.string(), z.unknown())
          .parse(await cloudflare(`workers/scripts/${name}/settings`));
        assertWorkerOwner(
          actual,
          target,
          name === target.api,
          existingStorage.database?.uuid,
          existingNamespaces,
        );
      }),
  );
  // Accessが使えないPRを先に公開しない。
  const access = await accessApplication(!cleanup);
  const squareEnabled = !cleanup && Boolean(process.env.TABLECAST_SQUARE_APPLICATION_ID);
  if (!squareEnabled) await syncPosWebhookAccess(target, false);
  // 同じ配備内で所有確認済みの既存資源を使い、欠落時・削除・resetは従来の経路へ進む。
  const { database, bucketExists, bucketCreated } =
    !cleanup && !resetFinished && existingStorage.database && existingStorage.bucketExists
      ? existingStorage
      : await resources(!cleanup);
  if (reset && (!database || !bucketExists))
    throw new Error("stagingのD1・R2が揃っていません。所有資源を確認してください。");
  if (!database && !bucketExists) {
    if (cleanup && !reset && access) await cloudflare(`access/apps/${access.id}`, "DELETE");
    return;
  }
  if (!database) throw new Error("D1の所有台帳がありません。残存R2を手動確認してください。");
  const options = deploymentOptions(
    target,
    cleanup ? "0".repeat(40) : sha,
    database.uuid,
    process.env.TABLECAST_OTEL_CAPTURE_CONTENT ?? "true",
  );
  const apiConfig = apiSdkConfiguration(options.api);

  if (!cleanup && secrets) {
    await writeFile(resolve(directory, "secrets.json"), JSON.stringify(secrets), { mode: 0o600 });
    await currentRevision(target, sha);
  }
  const headers = {
    ...(target.environment === "preview" && secrets
      ? {
          "CF-Access-Client-Id": secrets.CF_ACCESS_CLIENT_ID ?? "",
          "CF-Access-Client-Secret": secrets.CF_ACCESS_CLIENT_SECRET ?? "",
        }
      : {}),
  };
  const preparation = await Promise.allSettled([
    prepareStorage({
      cleanup,
      reset,
      resetFinished,
      database,
      bucketExists,
      bucketCreated,
      options,
      apiConfig,
      secrets,
      headers,
      seedTemplate,
    }),
    (async () => {
      if (cleanup || !target.emulate) return;
      console.time("検証済みイメージの送信");
      try {
        await cf(["containers", "push", "--tag", `tablecast-emulate:${sha}`]);
      } finally {
        console.timeEnd("検証済みイメージの送信");
      }
    })(),
  ]);
  const failure = preparation.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
  if (reset) {
    await main(true);
    const platform = await getPlatformProxy<Pick<TablecastEnv, "TABLECAST_MEDIA">>({
      configPath: resolve(directory, "storage.json"),
      envFiles: [resolve(directory, "empty.env")],
      remoteBindings: true,
      persist: false,
    });
    try {
      await platform.env.TABLECAST_MEDIA.delete("tablecast/staging-reset.json");
    } finally {
      await platform.dispose();
    }
    console.info("stagingを初期化しました。ログインとMCP認可をやり直してください。");
    return;
  }
  if (cleanup) {
    if (bucketExists) await cloudflare(`r2/buckets/${target.bucket}`, "DELETE");
    await cloudflare(`d1/database/${database.uuid}`, "DELETE");
    if (access) await cloudflare(`access/apps/${access.id}`, "DELETE");
    console.info(`PR #${target.pr} の資源を削除しました。`);
    return;
  }
  if (!secrets) throw new Error("配備secretがありません。");
  await currentRevision(target, sha);
  const webSecrets = resolve(directory, "web-secrets.json");
  await writeFile(
    webSecrets,
    JSON.stringify(
      secrets.TABLECAST_OTEL_AUTHORIZATION
        ? { TABLECAST_OTEL_AUTHORIZATION: secrets.TABLECAST_OTEL_AUTHORIZATION }
        : {},
    ),
    { mode: 0o600 },
  );
  for (const name of [target.api, target.web]) {
    const config = outputConfigs.find((value) => value.config.name === name);
    if (!config) throw new Error(`Viteの生成configがありません: ${name}`);
    const built = config.config;
    const artifact =
      name === target.api ? bindDeploymentDatabase(built, target, database.uuid) : built;
    await writeFile(
      config.configPath,
      JSON.stringify({
        ...artifact,
        env: {
          ...artifact.env,
          TABLECAST_OTEL_CAPTURE_CONTENT: {
            type: "text",
            value: apiConfig.vars.TABLECAST_OTEL_CAPTURE_CONTENT,
          },
          ...(name === target.api && apiConfig.vars.TABLECAST_LANGFUSE_BASE_URL
            ? {
                TABLECAST_LANGFUSE_BASE_URL: {
                  type: "text",
                  value: apiConfig.vars.TABLECAST_LANGFUSE_BASE_URL,
                },
                TABLECAST_LANGFUSE_PUBLIC_KEY: { type: "secret" },
                TABLECAST_LANGFUSE_SECRET_KEY: { type: "secret" },
              }
            : {}),
        },
      }),
    );
    if (name === target.api) {
      await currentRevision(target, sha);
    }
    const before = name === target.api ? await verifyDurableNamespaces() : [];
    await cf(
      [
        "deploy",
        "--prebuilt",
        "--mode",
        target.environment,
        "--worker",
        name,
        ...(name === target.api
          ? [
              "--secrets-file",
              resolve(directory, "secrets.json"),
              "--containers-rollout",
              "immediate",
            ]
          : ["--secrets-file", webSecrets]),
      ],
      resolve(root, "apps/web"),
    );
    if (name === target.api) {
      const after = await verifyDurableNamespaces();
      if (
        before.some(
          (namespace) =>
            !after.some((value) => value.id === namespace.id && value.class === namespace.class),
        )
      )
        throw new Error("再配備後に既存DO namespaceを確認できません。");
    }
  }
  await waitForRelease(target.origin, headers, sha);
  if (target.environment === "preview" && squareEnabled) {
    await syncPosWebhookAccess(target, true);
    try {
      await verifyPosWebhookAccess(target.origin);
    } catch (error) {
      await syncPosWebhookAccess(target, false);
      throw error;
    }
  }
  if (target.environment === "staging") await verifyStaging();
  console.info(`配備確認済み: ${target.origin} (${sha})`);
  if (process.env.GITHUB_STEP_SUMMARY)
    await writeFile(process.env.GITHUB_STEP_SUMMARY, `配備URL: ${target.origin}\n\nSHA: ${sha}\n`, {
      flag: "a",
    });
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    // 外部例外、CLI資格、OAuth応答をそのままログへ出さない。
    console.error(
      error instanceof Error && !error.message.includes("{")
        ? error.message
        : "配備に失敗しました。設定と対象を確認してください。",
    );
    process.exitCode = 1;
  } finally {
    await Promise.all(
      ["secrets.json", "web-secrets.json"].map((name) =>
        rm(resolve(directory, name), { force: true }),
      ),
    );
  }
}
