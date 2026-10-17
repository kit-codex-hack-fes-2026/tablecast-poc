import { apiCloudflareConfig, apiSdkConfiguration } from "../apps/api/cloudflare.config";
import { resetStagingDatabase } from "./tablecast-staging-reset";
import {
  cloudflare,
  currentRevision,
  waitForRelease,
  readBucketOwner,
} from "./tablecast-deploy-api";
import process from "node:process";
import { drizzle } from "drizzle-orm/d1";
import { drizzle as drizzleProxy } from "drizzle-orm/sqlite-proxy";
import { sql } from "drizzle-orm";
import { deploymentOwner } from "../apps/api/src/db/business-schema";
import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readBuildOutput } from "@cloudflare/build-output-utils";
import { buildTablecast } from "./tablecast-build";
import { getPlatformProxy } from "wrangler";
import { z } from "zod";
import { seedPreviewDatabase } from "./tablecast-seed-data";
import { readSeedTemplate } from "./tablecast-seed-template";
import {
  accessApplicationConfig,
  tablecastAdoptedResources,
  deploymentOptions,
  deploymentBuildOutput,
  bindDeploymentDatabase,
  deploymentSecrets,
  deploymentTarget,
  tablecastAccountId,
  tablecastRepository,
  stagingDiscoveryPaths,
} from "./tablecast-deploy-config";
import { assertWorkerOwner } from "./tablecast-infra-diff";
import { assertAccessConfiguration } from "./tablecast-infra-access";

const root = resolve(import.meta.dirname, "..");
const directory = resolve(root, ".local/tablecast-deploy");
const target = deploymentTarget(
  process.env.TABLECAST_PR_NUMBER || undefined,
  z.enum(["production", "staging", "preview"]).parse(process.env.TABLECAST_DEPLOY_ENV),
);
const sha = process.env.TABLECAST_RELEASE_SHA ?? "";
const databaseSchema = z.object({ uuid: z.uuid(), name: z.string() });
const accessSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string().optional(),
  destinations: z.array(z.object({ type: z.string(), uri: z.string().optional() })).optional(),
});

async function verifyStaging() {
  // Access資格なしでWeb・OAuthへ到達し、MCPのアプリ認可が維持されることを検査する。
  const request = (path: string, init?: RequestInit) =>
    fetch(`${target.origin}${path}`, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
  for (const path of stagingDiscoveryPaths) {
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
      response.status >= 500 ||
      response.headers.get("location")?.includes(".cloudflareaccess.com/") ||
      (path === "/" &&
        (!response.ok || !response.headers.get("content-type")?.includes("text/html")))
    )
      throw new Error(`stagingのブラウザー経路へ公開アクセスできません: ${path}`);
  }
  console.info("stagingのWeb公開・OAuth discovery・未認証MCP拒否を確認しました。");
}

async function run(args: [string, ...string[]], env: Record<string, string> = {}, cwd = root) {
  const code = await new Promise<number | null>((complete, reject) => {
    const child = spawn(args[0], args.slice(1), {
      cwd,
      env: { ...process.env, ...env },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", complete);
  });
  if (code !== 0) throw new Error(`配備コマンドが失敗しました: ${args.slice(0, 4).join(" ")}`);
}
const cf = (args: string[], cwd = root) =>
  run(
    ["node", resolve(root, "node_modules/cf/bin/cf"), ...args],
    { CLOUDFLARE_ACCOUNT_ID: tablecastAccountId },
    cwd,
  );

async function deployTemporaryWorker(worker: object, kind: string) {
  const temporary = resolve(directory, kind);
  await mkdir(temporary, { recursive: true });
  const apiManifest = z
    .object({ devDependencies: z.record(z.string(), z.string()) })
    .parse(JSON.parse(await readFile(resolve(root, "apps/api/package.json"), "utf8")));
  await writeFile(
    resolve(temporary, "package.json"),
    JSON.stringify({
      type: "module",
      devDependencies: {
        "@cloudflare/vite-plugin": apiManifest.devDependencies["@cloudflare/vite-plugin"],
        vite: apiManifest.devDependencies.vite,
      },
    }),
  );
  const modules = resolve(root, "apps/api/node_modules");
  const link = resolve(temporary, "node_modules");
  try {
    await symlink(modules, link, "dir");
  } catch (error) {
    if (
      !(error instanceof Error && "code" in error && error.code === "EEXIST") ||
      (await readlink(link)) !== modules
    )
      throw error;
  }
  await copyFile(resolve(root, "apps/api/vite.config.ts"), resolve(temporary, "vite.config.ts"));
  await writeFile(
    resolve(temporary, "cloudflare.config.ts"),
    `export default ${JSON.stringify({ accountId: tablecastAccountId, worker })};`,
  );
  await cf(["build", "--mode", target.environment], temporary);
  await cf(["deploy", "--prebuilt", "--mode", target.environment], temporary);
}

export async function resources(create: boolean) {
  const [databaseList, bucketList] = await Promise.all([
    cloudflare("d1/database?per_page=1000"),
    cloudflare("r2/buckets"),
  ]);
  const databases = z.array(databaseSchema).parse(databaseList);
  const { buckets } = z
    .object({ buckets: z.array(z.object({ name: z.string() })) })
    .parse(bucketList);
  if (databases.length >= 1000)
    throw new Error("D1一覧の上限に達しました。対象を再確認してください。");
  let databaseCreated = false;
  let database = databases.find((value) => value.name === target.database);
  if (
    target.environment !== "preview" &&
    database?.uuid !== tablecastAdoptedResources[target.environment].database
  )
    throw new Error("常設D1の採用IDが一致しません。作り直さず現物を照合してください。");
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
  const bucketExists = buckets.some((value) => value.name === target.bucket);
  if (bucketExists) {
    const owner = await readBucketOwner(target.bucket);
    if (
      owner.repository !== tablecastRepository ||
      owner.environment !== target.web ||
      owner.databaseId !== database?.uuid
    )
      throw new Error("R2の所有情報が一致しません。対象外資源は変更・削除できません。");
  }
  if (!bucketExists && create)
    await cloudflare("r2/buckets", "POST", { name: target.bucket, locationHint: "apac" });
  return { database, bucketExists, bucketCreated: create && !bucketExists };
}

export async function accessApplication(create: boolean) {
  if (!target.emulate) return undefined;
  const [applications] = await Promise.all([
    cloudflare("access/apps?per_page=1000"),
    create && target.environment !== "staging" ? assertAccessConfiguration() : undefined,
  ]);
  const apps = z.array(accessSchema).parse(applications);
  if (apps.length >= 1000) throw new Error("Access一覧の上限に達しました。");
  const domain = new URL(target.origin).hostname;
  if (target.environment === "staging") {
    // 公開運用への移行時に旧staging専用applicationだけを解除する。
    const owned = apps.filter((value) => [target.web, `${target.web}-mcp`].includes(value.name));
    for (const app of owned) {
      const expected = app.name === target.web ? domain : `${domain}/mcp`;
      if (
        app.domain !== expected ||
        app.destinations?.some(
          (value) =>
            value.type !== "public" ||
            (value.uri !== domain && !value.uri?.startsWith(`${domain}/`)),
        )
      )
        throw new Error("staging Accessの所有対象が一致しません。");
    }
    if (create) {
      for (const app of owned) await cloudflare(`access/apps/${app.id}`, "DELETE");
    }
    return undefined;
  }
  const app = apps.find((value) => value.name === target.web);
  if (app && app.domain !== domain) throw new Error("Accessの所有対象が一致しません。");
  if (create) {
    await cloudflare(
      `access/apps${app ? `/${app.id}` : ""}`,
      app ? "PUT" : "POST",
      accessApplicationConfig(target.web, domain),
    );
  }
  return app;
}

export async function verifyDurableNamespaces() {
  const namespaces = z
    .array(
      z.object({ id: z.string(), script: z.string(), class: z.string(), use_sqlite: z.boolean() }),
    )
    .parse(await cloudflare("workers/durable_objects/namespaces?per_page=1000"));
  if (namespaces.length >= 1000) throw new Error("DO一覧の上限に達しました。");
  const owned = namespaces.filter((namespace) => namespace.script === target.api);
  if (
    owned.some(
      (namespace) =>
        !["StoreEvents", "TablecastEmulate"].includes(namespace.class) || !namespace.use_sqlite,
    )
  )
    throw new Error(
      "既存DOのクラス・storageが採用設定と一致しません。移行履歴を再実行せず照合してください。",
    );
  if (target.environment !== "preview") {
    for (const [className, id] of Object.entries(
      tablecastAdoptedResources[target.environment].namespaces,
    ))
      if (!owned.some((namespace) => namespace.class === className && namespace.id === id))
        throw new Error("常設DOの採用IDが一致しません。namespaceを作り直せません。");
  }
  return owned;
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
            d1_databases: apiConfig.d1_databases.map((value) => ({ ...value, remote: true })),
            r2_buckets:
              bucketExists || bucketCreated
                ? apiConfig.r2_buckets.map((value) => ({ ...value, remote: true }))
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
            const registeredWorkers = z
              .array(z.object({ id: z.string() }))
              .parse(await cloudflare("workers/scripts"));
            if (reset) {
              const maintenance = resolve(directory, "maintenance.js");
              await writeFile(
                maintenance,
                'export default {fetch(){return new Response("TableCast staging maintenance", {status:503, headers:{"Cache-Control":"no-store"}})}};',
              );
              await deployTemporaryWorker(
                {
                  name: target.web,
                  entrypoint: maintenance,
                  compatibilityDate: "2026-09-03",
                  workersDev: true,
                  previewUrls: false,
                },
                "maintenance",
              );
              await recordReset("maintenance");
            } else if (registeredWorkers.some((value) => value.id === target.web)) {
              await cf(["workers", "delete", target.web, "--force"]);
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
            if (reset) {
              const maintenanceApi = resolve(directory, "maintenance-api.js");
              await writeFile(
                maintenanceApi,
                `export {StoreEvents, TablecastEmulate} from ${JSON.stringify(resolve(root, "apps/api/src/worker.ts"))}; export default {fetch(){return new Response("TableCast staging maintenance", {status:503})}};`,
              );
              const configured = apiCloudflareConfig(options.api);
              await deployTemporaryWorker(
                {
                  ...configured.worker,
                  entrypoint: maintenanceApi,
                  exports: {
                    StoreEvents: { type: "durable-object", storage: "sqlite" },
                    TablecastEmulate: { type: "durable-object", storage: "sqlite" },
                  },
                },
                "maintenance-api",
              );
              await verifyDurableNamespaces();
            } else if (registeredWorkers.some((value) => value.id === target.api)) {
              if (owned.length) {
                const retired = resolve(directory, "retired.js");
                await writeFile(
                  retired,
                  'export default { fetch() { return new Response("PR closed", { status: 410 }); } };',
                );
                await deployTemporaryWorker(
                  {
                    name: target.api,
                    entrypoint: retired,
                    compatibilityDate: "2026-09-03",
                    workersDev: false,
                    previewUrls: false,
                    exports: Object.fromEntries(
                      owned.map((value) => [
                        value.class,
                        { type: "durable-object", state: "deleted" },
                      ]),
                    ),
                  },
                  "retired",
                );
              }
              await cf(["workers", "delete", target.api, "--force"]);
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
            await cf([
              "d1",
              "migrations",
              "apply",
              database.uuid,
              "--dir",
              resolve(root, "apps/api/migrations"),
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
                seedTemplate,
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
