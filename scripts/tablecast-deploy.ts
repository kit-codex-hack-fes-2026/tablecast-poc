import { resetStagingDatabase } from "./tablecast-staging-reset";
import { cloudflare, currentRevision, waitForRelease } from "./tablecast-deploy-api";
import process from "node:process";
import { drizzle } from "drizzle-orm/d1";
import { drizzle as drizzleProxy } from "drizzle-orm/sqlite-proxy";
import { sql } from "drizzle-orm";
import { deploymentOwner } from "../apps/api/src/db/business-schema";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "jsonc-parser";
import { getPlatformProxy } from "wrangler";
import { z } from "zod";
import { seedPreviewDatabase } from "./tablecast-seed-data";
import {
  deploymentConfigs,
  deploymentArtifact,
  deploymentSecrets,
  deploymentTarget,
  tablecastAccountId,
  tablecastRepository,
  stagingMcpPaths,
} from "./tablecast-deploy-config";

const root = resolve(import.meta.dirname, "..");
const directory = resolve(root, ".local/tablecast-deploy");
const target = deploymentTarget(
  process.env.TABLECAST_PR_NUMBER || undefined,
  z.enum(["production", "staging", "preview"]).parse(process.env.TABLECAST_DEPLOY_ENV),
);
const sha = process.env.TABLECAST_RELEASE_SHA ?? "";
const databaseSchema = z.object({ uuid: z.uuid(), name: z.string() });
const accessSchema = z.object({ id: z.string(), name: z.string(), domain: z.string().optional() });

async function verifyStagingMcp() {
  // Access資格を送らず、機械通信はOAuthまで届きWebはAccessに留まることを検査する。
  const request = (path: string, init?: RequestInit) =>
    fetch(`${target.origin}${path}`, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
  for (const path of stagingMcpPaths.filter((value) => value.startsWith("/.well-known/"))) {
    const response = await request(path);
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json"))
      throw new Error(`stagingのOAuth discoveryに到達できません: ${path}`);
    const metadata = z
      .object({ resource: z.string().optional(), issuer: z.string().optional() })
      .parse(await response.json());
    if (
      metadata.resource !== `${target.origin}/mcp` &&
      metadata.issuer !== `${target.origin}/api/auth`
    )
      throw new Error("stagingのOAuth discoveryが別環境を参照しています。");
  }
  const mcp = await request("/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  if (
    mcp.status !== 401 ||
    !mcp.headers
      .get("www-authenticate")
      ?.includes(`${target.origin}/.well-known/oauth-protected-resource/mcp`)
  )
    throw new Error("stagingの未認証MCPがOAuthの401を返しません。");
  for (const path of ["/", "/_tablecast/oauth", "/api/auth/oauth2/authorize"]) {
    const response = await request(path);
    if (
      response.status !== 302 ||
      !response.headers.get("location")?.includes(".cloudflareaccess.com/")
    )
      throw new Error(`stagingのブラウザー経路がAccessで保護されていません: ${path}`);
  }
  console.info("stagingのAccess分離・OAuth discovery・未認証MCP拒否を確認しました。");
}

async function run(args: [string, ...string[]], env: Record<string, string> = {}) {
  const code = await new Promise<number | null>((complete, reject) => {
    const child = spawn(args[0], args.slice(1), {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", complete);
  });
  if (code !== 0) throw new Error(`配備コマンドが失敗しました: ${args.slice(0, 4).join(" ")}`);
}
const wrangler = (args: string[]) =>
  run([
    "bun",
    "--no-env-file",
    "x",
    "wrangler",
    ...args,
    "--env-file",
    resolve(directory, "empty.env"),
  ]);

async function resources(create: boolean) {
  const databases = z.array(databaseSchema).parse(await cloudflare("d1/database?per_page=1000"));
  if (databases.length >= 1000)
    throw new Error("D1一覧の上限に達しました。対象を再確認してください。");
  let databaseCreated = false;
  let database = databases.find((value) => value.name === target.database);
  if (!database && create) {
    database = databaseSchema.parse(
      await cloudflare("d1/database", "POST", {
        name: target.database,
        primary_location_hint: "apac",
      }),
    );
    databaseCreated = true;
  }
  if (database) {
    const databaseId = database.uuid;
    // 管理APIでもDrizzleがSQLと結果の対応を所有する。D1の配列応答を標準proxyへ渡す。
    const db = drizzleProxy(async (query, params, method) => {
      const result = z
        .array(
          z.object({
            success: z.literal(true),
            results: z.object({
              rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))),
            }),
          }),
        )
        .parse(await cloudflare(`d1/database/${databaseId}/raw`, "POST", { sql: query, params }));
      const rows = result[0]?.results.rows ?? [];
      return { rows: method === "get" ? (rows[0] ?? []) : rows };
    });
    if (databaseCreated) {
      await db.run(
        sql`CREATE TABLE tablecast_deployment_owner(repository TEXT NOT NULL, environment TEXT NOT NULL, seeded INTEGER NOT NULL DEFAULT 0)`,
      );
      await db
        .insert(deploymentOwner)
        .values({ repository: tablecastRepository, environment: target.web });
    }
    const owner = await db.select().from(deploymentOwner);
    if (
      owner.length !== 1 ||
      owner[0]?.repository !== tablecastRepository ||
      owner[0]?.environment !== target.web
    )
      throw new Error("D1の所有情報が一致しません。自動採用・削除は行いません。");
  }
  const { buckets } = z
    .object({ buckets: z.array(z.object({ name: z.string() })) })
    .parse(await cloudflare("r2/buckets"));
  const bucketExists = buckets.some((value) => value.name === target.bucket);
  if (!bucketExists && create)
    await cloudflare("r2/buckets", "POST", { name: target.bucket, locationHint: "apac" });
  return { database, bucketExists, bucketCreated: create && !bucketExists };
}

async function accessApplication(create: boolean) {
  if (!target.emulate) return undefined;
  const apps = z.array(accessSchema).parse(await cloudflare("access/apps?per_page=1000"));
  if (apps.length >= 1000) throw new Error("Access一覧の上限に達しました。");
  const app = apps.find((value) => value.name === target.web);
  const domain = new URL(target.origin).hostname;
  if (app && app.domain !== domain) throw new Error("Accessの所有対象が一致しません。");
  if (create) {
    const policy = z.string().min(1).parse(process.env.TABLECAST_PREVIEW_ACCESS_POLICY_ID);
    const servicePolicy = z.string().min(1).parse(process.env.TABLECAST_PREVIEW_SERVICE_POLICY_ID);
    await cloudflare(`access/apps${app ? `/${app.id}` : ""}`, app ? "PUT" : "POST", {
      name: target.web,
      domain,
      type: "self_hosted",
      session_duration: "24h",
      policies: [
        { id: policy, precedence: 1 },
        { id: servicePolicy, precedence: 2 },
      ],
    });
    if (target.environment === "staging") {
      const name = `${target.web}-mcp`;
      const existing = apps.find((value) => value.name === name);
      if (existing && existing.domain !== `${domain}/mcp`)
        throw new Error("MCP Accessの所有対象が一致しません。");
      await cloudflare(
        `access/apps${existing ? `/${existing.id}` : ""}`,
        existing ? "PUT" : "POST",
        {
          name,
          domain: `${domain}/mcp`,
          type: "self_hosted",
          destinations: stagingMcpPaths.map((path) => ({
            type: "public",
            uri: `${domain}${path}`,
          })),
          app_launcher_visible: false,
          policies: [
            {
              name: "TableCast MCP OAuth",
              decision: "bypass",
              include: [{ everyone: {} }],
              precedence: 1,
            },
          ],
        },
      );
    }
  }
  return app;
}

async function retireLegacyVoiceContainer() {
  const namespaces = z
    .array(z.object({ id: z.string(), script: z.string(), class: z.string() }))
    .parse(await cloudflare("workers/durable_objects/namespaces?per_page=1000"));
  if (namespaces.length >= 1000) throw new Error("DO一覧の上限に達しました。");
  const owned = namespaces.filter(
    (value) => value.script === target.api && value.class === "TablecastVoice",
  );
  if (!owned.length) return;
  const applications = z
    .array(
      z.object({
        id: z.string(),
        durable_objects: z.object({ namespace_id: z.string() }).optional(),
      }),
    )
    .parse(await cloudflare("containers/applications"));
  // 名前だけでは削除せず、この配備先の旧音声DOに紐付くapplicationだけを退役させる。
  for (const application of applications) {
    if (owned.some((value) => value.id === application.durable_objects?.namespace_id))
      await cloudflare(`containers/applications/${application.id}`, "DELETE");
  }
}

async function main(resetFinished = false) {
  const reset = process.argv.includes("--reset") && !resetFinished;
  if (process.argv.includes("--reset") && process.argv.includes("--cleanup"))
    throw new Error("resetとcleanupは同時に指定できません。");
  const cleanup = process.argv.includes("--cleanup") || reset;
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
    const configs = deploymentConfigs(
      target,
      sha,
      "11111111-1111-4111-8111-111111111111",
      root,
      z
        .record(z.string(), z.unknown())
        .parse(parse(await readFile(resolve(root, "apps/api/wrangler.jsonc"), "utf8"))),
      z
        .record(z.string(), z.unknown())
        .parse(parse(await readFile(resolve(root, "apps/web/wrangler.jsonc"), "utf8"))),
      process.env.TABLECAST_OTEL_CAPTURE_CONTENT ?? "true",
    );
    await writeFile(resolve(directory, "api.json"), JSON.stringify(configs.api, null, 2));
    await writeFile(resolve(directory, "web.json"), JSON.stringify(configs.web, null, 2));
    if (build)
      await run(["bun", "--no-env-file", "run", "build"], {
        TABLECAST_API_CONFIG: resolve(directory, "api.json"),
        TABLECAST_WEB_CONFIG: resolve(directory, "web.json"),
      });
    console.info(JSON.stringify({ mode: build ? "build" : "plan", ...target }));
    return;
  }
  await currentRevision(target, sha, cleanup && !reset);
  const secrets = cleanup && !reset ? undefined : deploymentSecrets(target, { ...process.env });
  // 資源変更前に、CI成果物が対象環境・SHAのものか確認する。
  const outputConfigs: { name: string; path: string }[] = [];
  if (!cleanup || reset) {
    for (const folder of await readdir(resolve(root, "apps/web/dist"))) {
      const path = resolve(root, "apps/web/dist", folder, "wrangler.json");
      if (!existsSync(path)) continue;
      const built = z
        .looseObject({ name: z.string() })
        .parse(JSON.parse(await readFile(path, "utf8")));
      if (built.name === target.api)
        deploymentArtifact(built, target, sha, "11111111-1111-4111-8111-111111111111");
      else if (built.name === target.web)
        z.object({
          vars: z.object({
            TABLECAST_RELEASE_SHA: z.literal(sha),
            TABLECAST_ENV: z.literal(target.environment),
          }),
          services: z
            .array(
              z.object({ binding: z.literal("TABLECAST_API"), service: z.literal(target.api) }),
            )
            .length(1),
        }).parse(built);
      outputConfigs.push({ name: built.name, path });
    }
    if (
      ![target.api, target.web].every((name) =>
        outputConfigs.some((config) => config.name === name),
      )
    )
      throw new Error("対象環境のCI成果物が揃っていません。");
  }
  // Accessが使えないPRを先に公開しない。
  const access = await accessApplication(!cleanup);
  const { database, bucketExists, bucketCreated } = await resources(!cleanup);
  if (reset && (!database || !bucketExists))
    throw new Error("stagingのD1・R2が揃っていません。所有資源を確認してください。");
  if (!database && !bucketExists) {
    if (cleanup && !reset && access) await cloudflare(`access/apps/${access.id}`, "DELETE");
    return;
  }
  if (!database) throw new Error("D1の所有台帳がありません。残存R2を手動確認してください。");
  const configs = deploymentConfigs(
    target,
    cleanup ? "0".repeat(40) : sha,
    database.uuid,
    root,
    z
      .record(z.string(), z.unknown())
      .parse(parse(await readFile(resolve(root, "apps/api/wrangler.jsonc"), "utf8"))),
    z
      .record(z.string(), z.unknown())
      .parse(parse(await readFile(resolve(root, "apps/web/wrangler.jsonc"), "utf8"))),
    process.env.TABLECAST_OTEL_CAPTURE_CONTENT ?? "true",
  );
  const apiPath = resolve(directory, "api.json");
  const webPath = resolve(directory, "web.json");
  await writeFile(apiPath, JSON.stringify(configs.api, null, 2));
  await writeFile(webPath, JSON.stringify(configs.web, null, 2));

  if (!cleanup && secrets) {
    await writeFile(resolve(directory, "secrets.json"), JSON.stringify(secrets), { mode: 0o600 });
    await currentRevision(target, sha);
  }
  const headers = {
    authorization: `Bearer ${secrets?.TABLECAST_VOICE_API_TOKEN ?? ""}`,
    ...(target.emulate && secrets
      ? {
          "CF-Access-Client-Id": secrets.CF_ACCESS_CLIENT_ID ?? "",
          "CF-Access-Client-Secret": secrets.CF_ACCESS_CLIENT_SECRET ?? "",
        }
      : {}),
  };
  const preparation = await Promise.allSettled([
    (async () => {
      console.time("DB・画像の配備準備");
      try {
        const storagePath = resolve(directory, "storage.json");
        await writeFile(
          storagePath,
          JSON.stringify({
            name: `${target.web}-storage`,
            account_id: tablecastAccountId,
            compatibility_date: "2026-09-03",
            d1_databases: configs.api.d1_databases.map((value) => ({ ...value, remote: true })),
            r2_buckets:
              bucketExists || bucketCreated
                ? configs.api.r2_buckets.map((value) => ({ ...value, remote: true }))
                : [],
          }),
        );
        const platform = await getPlatformProxy<
          Pick<TablecastEnv, "TABLECAST_DB" | "TABLECAST_MEDIA">
        >({
          configPath: storagePath,
          envFiles: [resolve(directory, "empty.env")],
          remoteBindings: true,
          persist: false,
        });
        try {
          if (bucketExists || bucketCreated) {
            const ownerKey = "tablecast/deployment-owner.json";
            const owner = {
              repository: tablecastRepository,
              environment: target.web,
              databaseId: database.uuid,
            };
            if (bucketCreated)
              await platform.env.TABLECAST_MEDIA.put(ownerKey, JSON.stringify(owner));
            const stored = await platform.env.TABLECAST_MEDIA.get(ownerKey);
            if (!stored || JSON.stringify(await stored.json()) !== JSON.stringify(owner))
              throw new Error("R2の所有情報が一致しません。");
          }
          const resetKey = "tablecast/staging-reset.json";
          if (target.environment === "staging") {
            const pending = await platform.env.TABLECAST_MEDIA.get(resetKey);
            if (pending && !reset && !resetFinished)
              throw new Error("stagingリセットが途中です。手動リセットを再実行してください。");
            if (reset) {
              if (pending) {
                const previous = z
                  .object({ sha: z.string().regex(/^[a-f0-9]{40}$/) })
                  .safeParse(await pending.json());
                if (!previous.success)
                  throw new Error("途中リセットの記録が不正です。所有情報を確認してください。");
                await platform.env.TABLECAST_MEDIA.put(
                  resetKey,
                  JSON.stringify({
                    sha,
                    previousSha: previous.data.sha,
                    resumedAt: new Date().toISOString(),
                  }),
                );
              } else {
                await waitForRelease(target.origin, headers, sha);
                await platform.env.TABLECAST_MEDIA.put(
                  resetKey,
                  JSON.stringify({ sha, startedAt: new Date().toISOString() }),
                );
              }
            }
          }
          const recordReset = async (phase: string) => {
            if (!reset) return;
            await platform.env.TABLECAST_MEDIA.put(
              resetKey,
              JSON.stringify({ sha, phase, updatedAt: new Date().toISOString() }),
            );
          };
          if (cleanup) {
            // Webを先に止め、他のWorkerが参照するAPIをforceで消さない。
            const workers = z
              .array(z.object({ id: z.string() }))
              .parse(await cloudflare("workers/scripts"));
            if (reset) {
              const maintenance = resolve(directory, "maintenance.js");
              await writeFile(
                maintenance,
                'export default {fetch(){return new Response("TableCast staging maintenance", {status:503, headers:{"Cache-Control":"no-store"}})}};',
              );
              const maintenanceConfig = resolve(directory, "maintenance.json");
              await writeFile(
                maintenanceConfig,
                JSON.stringify({
                  name: target.web,
                  account_id: tablecastAccountId,
                  main: maintenance,
                  compatibility_date: "2026-09-03",
                  workers_dev: true,
                  preview_urls: false,
                }),
              );
              await wrangler(["deploy", "--config", maintenanceConfig]);
              await recordReset("maintenance");
            } else if (workers.some((value) => value.id === target.web)) {
              await cloudflare(`workers/scripts/${target.web}`, "DELETE");
            }
            const namespaces = z
              .array(z.object({ id: z.string(), script: z.string(), class: z.string() }))
              .parse(await cloudflare("workers/durable_objects/namespaces?per_page=1000"));
            if (namespaces.length >= 1000) throw new Error("DO一覧の上限に達しました。");
            const owned = namespaces.filter((value) => value.script === target.api);
            const applications = z
              .array(
                z.object({
                  id: z.string(),
                  durable_objects: z.object({ namespace_id: z.string() }).optional(),
                }),
              )
              .parse(await cloudflare("containers/applications"));
            for (const application of applications) {
              if (owned.some((value) => value.id === application.durable_objects?.namespace_id))
                await cloudflare(`containers/applications/${application.id}`, "DELETE");
            }
            if (workers.some((value) => value.id === target.api)) {
              if (owned.length) {
                const retired = resolve(directory, "retired.js");
                await writeFile(
                  retired,
                  'export default { fetch() { return new Response("PR closed", { status: 410 }); } };',
                );
                const retiredConfig = resolve(directory, "retired.json");
                await writeFile(
                  retiredConfig,
                  JSON.stringify({
                    name: target.api,
                    account_id: tablecastAccountId,
                    main: retired,
                    compatibility_date: "2026-09-03",
                    workers_dev: false,
                    preview_urls: false,
                    exports: Object.fromEntries(
                      owned.map((value) => [
                        value.class,
                        { type: "durable-object", state: "deleted" },
                      ]),
                    ),
                  }),
                );
                await wrangler(["deploy", "--config", retiredConfig]);
              }
              await cloudflare(`workers/scripts/${target.api}`, "DELETE");
            }
            await recordReset("runtime-removed");
            if (bucketExists) {
              for (;;) {
                const objects = await platform.env.TABLECAST_MEDIA.list({ limit: 1000 });
                const keys = objects.objects
                  .map((value) => value.key)
                  .filter(
                    (key) =>
                      key !== "tablecast/deployment-owner.json" && (!reset || key !== resetKey),
                  );
                if (!keys.length) break;
                await platform.env.TABLECAST_MEDIA.delete(keys);
              }
              if (!reset)
                await platform.env.TABLECAST_MEDIA.delete("tablecast/deployment-owner.json");
            }
            await recordReset("media-cleared");
            if (reset)
              await resetStagingDatabase({
                ...platform.env,
                TABLECAST_ENV: target.environment,
                TABLECAST_PUBLIC_ORIGIN: target.origin,
              });
            await recordReset("data-cleared");
          } else {
            await currentRevision(target, sha);
            await wrangler([
              "d1",
              "migrations",
              "apply",
              "TABLECAST_DB",
              "--remote",
              "--config",
              apiPath,
            ]);
            if (target.emulate && secrets) {
              const seeded = await seedPreviewDatabase(
                {
                  ...platform.env,
                  TABLECAST_AUTH_SECRET: secrets.TABLECAST_AUTH_SECRET ?? "",
                  TABLECAST_ENV: target.environment,
                  TABLECAST_PUBLIC_ORIGIN: target.origin,
                },
                {
                  email: "haruka.sato@komorebi-shijo.com",
                  otherEmail: "tsubasa.yamamoto@westward-burgers-kyoto.com",
                  password: crypto.randomUUID(),
                  otherPassword: crypto.randomUUID(),
                  baseTime: Date.now(),
                  profile: "demo",
                },
              );
              if (seeded) {
                await drizzle(platform.env.TABLECAST_DB).update(deploymentOwner).set({ seeded: 1 });
              }
            }
          }
        } finally {
          await platform.dispose();
        }
      } finally {
        console.timeEnd("DB・画像の配備準備");
      }
    })(),
    (async () => {
      if (cleanup || !target.emulate) return;
      console.time("検証済みイメージの送信");
      try {
        await wrangler(["containers", "push", `tablecast-emulate:${sha}`]);
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
    const config = outputConfigs.find((value) => value.name === name);
    if (!config) throw new Error(`Viteの生成configがありません: ${name}`);
    const built = z
      .looseObject({ vars: z.record(z.string(), z.unknown()) })
      .parse(JSON.parse(await readFile(config.path, "utf8")));
    const artifact =
      name === target.api ? deploymentArtifact(built, target, sha, database.uuid) : built;
    await writeFile(
      config.path,
      JSON.stringify({
        ...artifact,
        vars: {
          ...artifact.vars,
          TABLECAST_OTEL_CAPTURE_CONTENT: configs.api.vars.TABLECAST_OTEL_CAPTURE_CONTENT,
        },
      }),
    );
    if (name === target.api) {
      await currentRevision(target, sha);
      await retireLegacyVoiceContainer();
    }
    await wrangler([
      "deploy",
      "--config",
      config.path,
      ...(name === target.api
        ? [
            "--secrets-file",
            resolve(directory, "secrets.json"),
            "--containers-rollout",
            "immediate",
          ]
        : ["--secrets-file", webSecrets]),
    ]);
  }
  await waitForRelease(target.origin, headers, sha);
  if (target.environment === "staging") await verifyStagingMcp();
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
