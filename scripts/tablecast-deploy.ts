import process from "node:process";
import { drizzle } from "drizzle-orm/d1";
import { drizzle as drizzleProxy } from "drizzle-orm/sqlite-proxy";
import { sql } from "drizzle-orm";
import { deploymentOwner } from "../apps/api/src/db/business-schema";
import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
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
} from "./tablecast-deploy-config";

const root = resolve(import.meta.dirname, "..");
const execFileAsync = promisify(execFile);
const directory = resolve(root, ".local/tablecast-deploy");
const target = deploymentTarget(process.env.TABLECAST_PR_NUMBER || undefined);
const sha = process.env.TABLECAST_RELEASE_SHA ?? "";
const responseSchema = z.object({ success: z.boolean(), result: z.unknown() });
const databaseSchema = z.object({ uuid: z.uuid(), name: z.string() });
const accessSchema = z.object({ id: z.string(), name: z.string(), domain: z.string().optional() });

export async function uploadPreviewImage(
  bucket: Pick<R2Bucket, "head"> & {
    put(
      key: string,
      bytes: Uint8Array,
      options: R2PutOptions & { onlyIf: R2Conditional },
    ): Promise<R2Object | null>;
  },
  key: string,
  bytes: Uint8Array,
) {
  const md5 = createHash("md5").update(bytes).digest("hex");
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const stored = await bucket.head(key);
      if (stored) {
        if (stored.etag !== md5 || stored.size !== bytes.length)
          throw new Error("既存画像の内容が一致しません");
        console.info(`画像確認済み: ${key}`);
        return;
      }
      const uploaded = await bucket.put(key, bytes, {
        onlyIf: { etagDoesNotMatch: "*" },
        md5,
        httpMetadata: { contentType: "image/png" },
        customMetadata: { source: "synthetic-demo" },
      });
      if (!uploaded || uploaded.etag !== md5 || uploaded.size !== bytes.length)
        throw new Error("画像の保存結果を確認できません");
      console.info(`画像投入済み: ${key}`);
      return;
    } catch (error) {
      const code = error instanceof Error ? /\((\d+)\)$/.exec(error.message)?.[1] : undefined;
      if (code !== "10001" || attempt === 3)
        throw new Error(
          `R2画像投入失敗: ${key} (code=${code ?? "整合性・接続"}, attempt=${attempt})`,
          { cause: error },
        );
      console.warn(`R2一時障害: ${key} (code=${code}, attempt=${attempt}/3)`);
      await new Promise((complete) => setTimeout(complete, 1_000 * 2 ** (attempt - 1)));
    }
  }
}

export async function waitForRelease(
  origin: string,
  headers: Record<string, string>,
  releaseSha: string,
) {
  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      const response = await fetch(`${origin}/api/health`, {
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(5_000),
      });
      const health = z.object({ releaseSha: z.string() }).safeParse(await response.json());
      if (response.ok && health.success && health.data.releaseSha === releaseSha) return;
      console.info(`配備の反映待ち ${attempt}/12: HTTP ${response.status}`);
    } catch {
      // 一時的な接続失敗やHTML応答は再試行し、資格を含み得る応答本文は出さない。
      console.info(`配備の反映待ち ${attempt}/12: healthを取得できません。`);
    }
    if (attempt < 12) await new Promise((complete) => setTimeout(complete, 5_000));
  }
  throw new Error("配備先のrelease SHAを期限内に確認できません。");
}

async function cloudflare(path: string, method = "GET", body?: unknown) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("CLOUDFLARE_API_TOKENをActions secretへ登録してください。");
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${tablecastAccountId}/${path}`,
    {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
  if (!response.ok)
    throw new Error(`Cloudflare ${method} ${path.split("?")[0]}: HTTP ${response.status}`);
  const data = responseSchema.parse(await response.json());
  if (!data.success) throw new Error(`Cloudflare ${method} ${path.split("?")[0]}に失敗しました。`);
  return data.result;
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

async function currentRevision(cleanup = false) {
  const gh = await execFileAsync("gh", [
    "api",
    target.pr
      ? `repos/${tablecastRepository}/pulls/${target.pr}`
      : `repos/${tablecastRepository}/commits/main`,
  ]);
  const value: unknown = JSON.parse(gh.stdout);
  if (target.pr) {
    const pr = z
      .object({
        state: z.string(),
        head: z.object({ sha: z.string(), repo: z.object({ full_name: z.string() }) }),
      })
      .parse(value);
    if (
      pr.head.repo.full_name !== tablecastRepository ||
      pr.state !== (cleanup ? "closed" : "open") ||
      (!cleanup && pr.head.sha !== sha)
    )
      throw new Error("PRが更新・終了したか、同一リポジトリのPRではありません。");
  } else if (z.object({ sha: z.string() }).parse(value).sha !== sha) {
    throw new Error("mainが更新されました。新しいCIの配備に任せます。");
  }
}

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
  if (!target.pr) return undefined;
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
  }
  return app;
}

async function main() {
  const cleanup = process.argv.includes("--cleanup");
  const plan = process.argv.includes("--plan");
  const build = process.argv.includes("--build");
  if (cleanup && !target.pr) throw new Error("本番資源はcleanupできません。");
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
  await currentRevision(cleanup);
  const secrets = cleanup ? undefined : deploymentSecrets(target, { ...process.env });
  // Accessが使えないPRを先に公開しない。
  const access = await accessApplication(!cleanup);
  const { database, bucketExists, bucketCreated } = await resources(!cleanup);
  if (!database && !bucketExists) {
    if (cleanup && access) await cloudflare(`access/apps/${access.id}`, "DELETE");
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
  );
  const apiPath = resolve(directory, "api.json");
  const webPath = resolve(directory, "web.json");
  await writeFile(apiPath, JSON.stringify(configs.api, null, 2));
  await writeFile(webPath, JSON.stringify(configs.web, null, 2));

  if (!cleanup && secrets) {
    await writeFile(resolve(directory, "secrets.json"), JSON.stringify(secrets), { mode: 0o600 });
    await currentRevision();
  }
  const headers = {
    authorization: `Bearer ${secrets?.TABLECAST_VOICE_API_TOKEN ?? ""}`,
    ...(target.pr && secrets
      ? {
          "CF-Access-Client-Id": secrets.CF_ACCESS_CLIENT_ID ?? "",
          "CF-Access-Client-Secret": secrets.CF_ACCESS_CLIENT_SECRET ?? "",
        }
      : {}),
  };
  let drained = false;
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
    const platform = await getPlatformProxy<Pick<TablecastEnv, "TABLECAST_DB" | "TABLECAST_MEDIA">>(
      {
        configPath: storagePath,
        envFiles: [resolve(directory, "empty.env")],
        remoteBindings: true,
        persist: false,
      },
    );
    try {
      if (bucketExists || bucketCreated) {
        const ownerKey = "tablecast/deployment-owner.json";
        const owner = {
          repository: tablecastRepository,
          environment: target.web,
          databaseId: database.uuid,
        };
        if (bucketCreated) await platform.env.TABLECAST_MEDIA.put(ownerKey, JSON.stringify(owner));
        const stored = await platform.env.TABLECAST_MEDIA.get(ownerKey);
        if (!stored || JSON.stringify(await stored.json()) !== JSON.stringify(owner))
          throw new Error("R2の所有情報が一致しません。");
      }
      if (cleanup) {
        // Webを先に止め、他のWorkerが参照するAPIをforceで消さない。
        const workers = z
          .array(z.object({ id: z.string() }))
          .parse(await cloudflare("workers/scripts"));
        if (workers.some((value) => value.id === target.web))
          await cloudflare(`workers/scripts/${target.web}`, "DELETE");
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
                  owned.map((value) => [value.class, { type: "durable-object", state: "deleted" }]),
                ),
              }),
            );
            await wrangler(["deploy", "--config", retiredConfig]);
          }
          await cloudflare(`workers/scripts/${target.api}`, "DELETE");
        }
        if (bucketExists) {
          for (;;) {
            const objects = await platform.env.TABLECAST_MEDIA.list({ limit: 1000 });
            const keys = objects.objects
              .map((value) => value.key)
              .filter((key) => key !== "tablecast/deployment-owner.json");
            if (!keys.length) break;
            await platform.env.TABLECAST_MEDIA.delete(keys);
          }
          await platform.env.TABLECAST_MEDIA.delete("tablecast/deployment-owner.json");
        }
      } else {
        const workers = z
          .array(z.object({ id: z.string() }))
          .parse(await cloudflare("workers/scripts"));
        if (workers.some((value) => value.id === target.web)) {
          const response = await fetch(`${target.origin}/internal/deploy/drain`, {
            method: "POST",
            headers,
            redirect: "manual",
          });
          if (!response.ok)
            throw new Error("通話中、またはdrainを確認できません。終了後に再配備してください。");
          drained = true;
        }
        await currentRevision();
        await wrangler([
          "d1",
          "migrations",
          "apply",
          "TABLECAST_DB",
          "--remote",
          "--config",
          apiPath,
        ]);
        if (target.pr && secrets) {
          const seeded = await seedPreviewDatabase(
            {
              ...platform.env,
              TABLECAST_AUTH_SECRET: secrets.TABLECAST_AUTH_SECRET ?? "",
              TABLECAST_ENV: "preview",
              TABLECAST_PUBLIC_ORIGIN: target.origin,
            },
            {
              email: "owner@tablecast.example",
              otherEmail: "koharu@tablecast.example",
              password: crypto.randomUUID(),
              otherPassword: crypto.randomUUID(),
              baseTime: Date.now(),
              profile: "demo",
            },
          );
          if (seeded) {
            const files = (await readdir(resolve(root, "assets/demo"))).filter((value) =>
              /^[a-z0-9-]+\.png$/.test(value),
            );
            for (let offset = 0; offset < files.length; offset += 4) {
              const results = await Promise.allSettled(
                files
                  .slice(offset, offset + 4)
                  .map(async (file) =>
                    uploadPreviewImage(
                      platform.env.TABLECAST_MEDIA,
                      `tablecast/demo/${file}`,
                      await readFile(resolve(root, "assets/demo", file)),
                    ),
                  ),
              );
              // 同時処理の完了を待ってからproxyを閉じる。失敗時は次の組へ進まない。
              for (const result of results) if (result.status === "rejected") throw result.reason;
            }
            await drizzle(platform.env.TABLECAST_DB).update(deploymentOwner).set({ seeded: 1 });
          }
        }
      }
    } finally {
      await platform.dispose();
    }
    if (cleanup) {
      if (bucketExists) await cloudflare(`r2/buckets/${target.bucket}`, "DELETE");
      await cloudflare(`d1/database/${database.uuid}`, "DELETE");
      if (access) await cloudflare(`access/apps/${access.id}`, "DELETE");
      console.info(`PR #${target.pr} の資源を削除しました。`);
      return;
    }
    if (!secrets) throw new Error("配備secretがありません。");
    for (const image of ["tablecast-voice", ...(target.pr ? ["tablecast-emulate"] : [])])
      await wrangler(["containers", "push", `${image}:${sha}`]);
    // Viteが出力した設定を利用し、APIを別bundleしない。
    const outputs = await readdir(resolve(root, "apps/web/dist"));
    const outputConfigs: { name: string; path: string }[] = [];
    for (const folder of outputs) {
      const path = resolve(root, "apps/web/dist", folder, "wrangler.json");
      if (existsSync(path))
        outputConfigs.push({
          name: z.object({ name: z.string() }).parse(JSON.parse(await readFile(path, "utf8"))).name,
          path,
        });
    }
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
      if (name === target.api)
        await writeFile(
          config.path,
          JSON.stringify(
            deploymentArtifact(
              JSON.parse(await readFile(config.path, "utf8")),
              target,
              sha,
              database.uuid,
            ),
          ),
        );
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
    console.info(`配備確認済み: ${target.origin} (${sha})`);
    if (process.env.GITHUB_STEP_SUMMARY)
      await writeFile(
        process.env.GITHUB_STEP_SUMMARY,
        `配備URL: ${target.origin}\n\nSHA: ${sha}\n`,
        { flag: "a" },
      );
  } finally {
    if (drained) {
      const response = await fetch(`${target.origin}/internal/deploy/resume`, {
        method: "POST",
        headers,
        redirect: "manual",
      });
      if (!response.ok) {
        console.error("音声の新規受付を再開できません。運用手順を確認してください。");
        process.exitCode = 1;
      }
    }
  }
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
    await rm(resolve(directory, "secrets.json"), { force: true });
  }
}
