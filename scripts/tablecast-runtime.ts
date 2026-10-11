import process from "node:process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, realpath, writeFile, symlink, readlink } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { parseEnv, promisify } from "node:util";
import { execFile } from "node:child_process";
import { z } from "zod";
import { migrateLocalDatabase } from "./tablecast-local-state";
import { apiSdkConfiguration } from "../apps/api/cloudflare.config";

const execute = promisify(execFile);
export const tablecastRoot = await realpath(resolve(import.meta.dirname, ".."));
const { stdout: tablecastCommonPath } = await execute("git", ["rev-parse", "--git-common-dir"], {
  cwd: tablecastRoot,
});
const tablecastCommon = await realpath(resolve(tablecastRoot, tablecastCommonPath.trim()));
const tablecastId = worktreeId(tablecastRoot, tablecastCommon);
const tablecastHost = `${tablecastId}.tablecast-poc`;
export const tablecastContainer = process.env.TABLECAST_CONTAINER === "1";
export const tablecastLocal = join(tablecastRoot, ".local");
const runtimeSchema = z.object({
  ports: z.object({ web: z.number().int().min(0).max(65535) }),
});
type TablecastRuntime = Awaited<ReturnType<typeof readRuntime>>;

export function worktreeId(root: string, common: string) {
  return createHash("sha256").update(`${common}\0${root}`).digest("hex").slice(0, 10);
}

const writeJson = (path: string, value: unknown) =>
  writeFile(path, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });

async function serviceOrigin(service: string) {
  const { stdout } = await execute(
    "bunx",
    ["--no-install", "portless", "get", `${service}.${tablecastHost}`, "--no-worktree"],
    {
      cwd: tablecastRoot,
      env: {
        ...process.env,
        PORTLESS_HTTPS: "0",
        PORTLESS_PORT: process.env.PORTLESS_PORT ?? "80",
      },
    },
  );
  const origin = stdout.trim();
  const url = new URL(origin);
  if (url.protocol !== "http:" || (url.port || "80") !== (process.env.PORTLESS_PORT ?? "80"))
    throw new Error(
      "共有Portless proxyのHTTPポートが異なります。setupの初期設定を確認してください。",
    );
  return origin;
}

export async function localReleaseSha(root: string) {
  const [{ stdout: sha }, { stdout: status }] = await Promise.all([
    execute("git", ["rev-parse", "HEAD"], { cwd: root }),
    execute("git", ["status", "--porcelain", "--untracked-files=normal"], { cwd: root }),
  ]);
  return `${sha.trim()}${status ? "-dirty" : ""}`;
}

export async function readRuntime() {
  const file = Bun.file(join(tablecastLocal, "runtime.json"));
  const origin = tablecastContainer
    ? process.env.TABLECAST_CONTAINER_ORIGIN || "http://localhost:3000"
    : await serviceOrigin("web");
  const hostname = new URL(origin).hostname;
  if (
    !["localhost", "127.0.0.1"].includes(hostname) &&
    !hostname.endsWith(".localhost") &&
    !(tablecastContainer && hostname.endsWith(".orb.local"))
  )
    throw new Error("非ローカルの開発originは使用できません。");
  // 保存したパスやoriginは採用せず、操作対象をこのmoduleのworktree内へ固定する。
  return {
    id: tablecastId,
    root: tablecastRoot,
    state: join(tablecastLocal, "state"),
    apiConfig: join(tablecastLocal, "api.wrangler.json"),
    origin,
    ports: (await file.exists()) ? runtimeSchema.parse(await file.json()).ports : { web: 0 },
  };
}

export async function portAvailable(port: number): Promise<boolean> {
  if (!port) return true;
  return new Promise((done) => {
    const server = createServer();
    server.once("error", () => done(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => done(true));
    });
  });
}

// Bunが読み込んだ開発設定のうち、起動所有者へ必要な値だけを渡す。
export function developmentSecrets() {
  return Object.fromEntries(
    ["TABLECAST_MODEL_API_KEY", "TABLECAST_MODEL", "TABLECAST_OTEL_CAPTURE_CONTENT"].flatMap(
      (key) => (process.env[key] ? [[key, process.env[key]]] : []),
    ),
  );
}

async function writeLocalConfigs(runtime: TablecastRuntime) {
  const external = developmentSecrets();
  const apiName = `tablecast-${runtime.id}-api`;
  const telemetryVars = {
    TABLECAST_ENV: "development",
    TABLECAST_RELEASE_SHA: await localReleaseSha(tablecastRoot),
    TABLECAST_OTEL_ENDPOINT: tablecastContainer
      ? "http://tablecast-lgtm:4318"
      : await serviceOrigin("otlp"),
  };
  const configuration = {
    api: {
      name: apiName,
      vars: {
        ...telemetryVars,
        TABLECAST_VOICE_ENABLED: ["TABLECAST_MODEL_API_KEY", "TABLECAST_MODEL"]
          .every((key) => Boolean(external[key]))
          .toString(),
        TABLECAST_OTEL_CAPTURE_CONTENT: external.TABLECAST_OTEL_CAPTURE_CONTENT ?? "false",
        TABLECAST_PUBLIC_ORIGIN: runtime.origin,
        TABLECAST_GOOGLE_EMULATOR_URL: tablecastContainer
          ? "http://127.0.0.1:3008"
          : await serviceOrigin("oauth"),
        ...(tablecastContainer
          ? { TABLECAST_GOOGLE_AUTHORIZE_URL: `${runtime.origin}/_tablecast/oauth` }
          : {}),
        TABLECAST_MAILPIT_URL: tablecastContainer
          ? "http://127.0.0.1:8025"
          : await serviceOrigin("mailpit"),
        TABLECAST_EMAIL_FROM: "tablecast@localhost.test",
      },
      database: { name: `tablecast-${runtime.id}`, id: "00000000-0000-4000-8000-000000000000" },
      bucket: `tablecast-${runtime.id}-media`,
    },
    web: { name: `tablecast-${runtime.id}-web`, api: apiName, vars: telemetryVars },
  };
  // SDKが必要とするAPI設定だけを、workspaceの正本から一方向に変換する。
  await writeJson(runtime.apiConfig, apiSdkConfiguration(configuration.api));
  const secretPath = join(tablecastLocal, ".dev.vars");
  const secretFile = Bun.file(secretPath);
  const previous = (await secretFile.exists()) ? parseEnv(await secretFile.text()) : {};
  const values: Record<string, string> = {
    TABLECAST_OTEL_CAPTURE_CONTENT: "false",
    ...external,
    TABLECAST_VOICE_ENABLED: ["TABLECAST_MODEL_API_KEY", "TABLECAST_MODEL"]
      .every((key) => Boolean(external[key]))
      .toString(),
    TABLECAST_AUTH_SECRET: previous.TABLECAST_AUTH_SECRET ?? randomUUID().replaceAll("-", ""),
  };
  const writeEnv = (path: string, entries: Record<string, string>) =>
    writeFile(
      path,
      Object.entries(entries)
        // Bunのdotenvは二重引用符内の\"を展開しないため、JSONは一重引用符で渡す。
        .map(
          ([key, value]) =>
            `${key}=${key === "TABLECAST_CONFIG" ? `'${value}'` : JSON.stringify(value)}`,
        )
        .join("\n") + "\n",
      { mode: 0o600 },
    );
  await writeEnv(secretPath, values);
  for (const workspace of ["api", "web"]) {
    const link = join(tablecastRoot, "apps", workspace, ".dev.vars");
    try {
      await symlink(secretPath, link);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
      if ((await readlink(link)) !== secretPath)
        throw new Error("workspaceの.dev.varsが別の設定を参照しています。", { cause: error });
    }
  }
  await writeEnv(join(tablecastLocal, ".env"), {
    TABLECAST_PUBLIC_ORIGIN: runtime.origin,
    TABLECAST_CONFIG: JSON.stringify(configuration)
      .replaceAll("'", "\\u0027")
      .replaceAll("$", "\\u0024"),
    TABLECAST_STATE_PATH: runtime.state,
    TABLECAST_INSPECTOR_PORT: tablecastContainer ? "3002" : "0",
    HOST: tablecastContainer ? "0.0.0.0" : "127.0.0.1",
    ...(tablecastContainer
      ? { PORT: String(runtime.ports.web), TABLECAST_OAUTH_PORT: "3008" }
      : {}),
    COMPOSE_PROJECT_NAME: `tablecast-${runtime.id}`,
    TABLECAST_HOST: tablecastContainer
      ? `${process.env.TABLECAST_WORKTREE_NAME}.${process.env.TABLECAST_REPO_NAME}.container`
      : tablecastHost,
    TABLECAST_GRAFANA_ORIGIN: tablecastContainer
      ? "http://tablecast-lgtm:3000"
      : await serviceOrigin("grafana"),
    PORTLESS_HTTPS: "0",
    PORTLESS_PORT: process.env.PORTLESS_PORT ?? "80",
    WRANGLER_SEND_METRICS: "false",
    CLOUDFLARE_REGISTRY_PATH: join(tablecastLocal, "tablecast-wrangler-registry"),
    MINIFLARE_REGISTRY_PATH: join(tablecastLocal, "tablecast-wrangler-registry"),
    WRANGLER_REGISTRY_PATH: join(tablecastLocal, "tablecast-wrangler-registry"),
    BUN_CONFIG_NO_CLEAR_TERMINAL: "true",
  });
}

if (import.meta.main) {
  process.umask(0o077);
  const webPortOnly = process.argv.includes("--web-port");
  if (webPortOnly && !process.env.PORT)
    throw new Error("Webの起動はPortlessから実行してください。");
  const runtime = await readRuntime();
  if (!(await portAvailable(runtime.ports.web)))
    throw new Error("このworktreeの開発プロセスをCtrl+Cで停止してから初期化してください。");
  runtime.ports.web = z
    .number()
    .int()
    .min(0)
    .max(65535)
    .parse(Number(process.env.PORT ?? (tablecastContainer ? 3001 : 0)));
  await mkdir(tablecastLocal, { recursive: true, mode: 0o700 });
  await writeJson(join(tablecastLocal, "runtime.json"), { ports: runtime.ports });
  if (!webPortOnly) {
    await migrateLocalDatabase(
      runtime.state,
      join(tablecastLocal, "tablecast-cf-state-migration.json"),
    );
    await writeLocalConfigs(runtime);
  }
  console.info(`TableCast: ${runtime.origin}`);
}
