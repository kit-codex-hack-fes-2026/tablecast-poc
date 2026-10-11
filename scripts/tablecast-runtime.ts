import process from "node:process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, writeFile, symlink, readlink } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv, promisify } from "node:util";
import { execFile } from "node:child_process";
import { z } from "zod";
import { migrateLocalDatabase } from "./tablecast-local-state";
import { apiSdkConfiguration } from "../apps/api/cloudflare.config";

const execute = promisify(execFile);
export const tablecastRoot = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const { stdout: tablecastCommonPath } = await execute("git", ["rev-parse", "--git-common-dir"], {
  cwd: tablecastRoot,
});
const tablecastCommon = await realpath(resolve(tablecastRoot, tablecastCommonPath.trim()));
const tablecastId = worktreeId(tablecastRoot, tablecastCommon);
const tablecastHost = `${tablecastId}.tablecast-poc`;
export const tablecastContainer = process.env.TABLECAST_CONTAINER === "1";
export const tablecastLocal = join(tablecastRoot, ".local");
const portSchema = z.number().int().min(0).max(65535);
const portsSchema = z.object({
  web: portSchema,
  inspector: portSchema,
  oauth: portSchema,
  mailpit: portSchema,
  grafana: portSchema,
  otlp: portSchema,
  tempo: portSchema,
});
const runtimeSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{10}$/),
  root: z.string(),
  origin: z.string().url(),
  ports: portsSchema,
  state: z.string(),
  apiConfig: z.string(),
});
export type TablecastRuntime = z.infer<typeof runtimeSchema>;

export function worktreeId(root: string, common: string) {
  return createHash("sha256").update(`${common}\0${root}`).digest("hex").slice(0, 10);
}

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

export function assertLocalRuntime(runtime: TablecastRuntime, root: string, origin: string) {
  const local = join(root, ".local");
  if (
    runtime.root !== root ||
    runtime.state !== join(local, "state") ||
    runtime.apiConfig !== join(local, "api.wrangler.json") ||
    runtime.origin !== origin ||
    (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname) &&
      !new URL(origin).hostname.endsWith(".localhost") &&
      !(tablecastContainer && new URL(origin).hostname.endsWith(".orb.local")))
  ) {
    throw new Error("別worktree・非ローカル・不整合の設定を操作できません。");
  }
}

export async function readRuntime() {
  const value: unknown = JSON.parse(await readFile(join(tablecastLocal, "runtime.json"), "utf8"));
  const runtime = runtimeSchema.parse(value);
  assertLocalRuntime(
    runtime,
    tablecastRoot,
    tablecastContainer
      ? process.env.TABLECAST_CONTAINER_ORIGIN || "http://localhost:3000"
      : await serviceOrigin("web"),
  );
  return runtime;
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

export async function prepareRuntime() {
  await mkdir(tablecastLocal, { recursive: true, mode: 0o700 });
  const origin = tablecastContainer
    ? process.env.TABLECAST_CONTAINER_ORIGIN || "http://localhost:3000"
    : await serviceOrigin("web");
  let previous: TablecastRuntime | undefined;
  try {
    previous = runtimeSchema.parse(
      JSON.parse(await readFile(join(tablecastLocal, "runtime.json"), "utf8")),
    );
    // 旧originも保存先の所有を確認してから移行し、D1・R2とsecretは保持する。
    assertLocalRuntime(previous, tablecastRoot, previous.origin);
    if (!(await portAvailable(previous.ports.web)))
      throw new Error("このworktreeの開発プロセスをCtrl+Cで停止してから初期化してください。");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const ports = tablecastContainer
    ? {
        web: 3001,
        inspector: 3002,
        oauth: 3008,
        mailpit: 8025,
        grafana: 3030,
        otlp: 4318,
        tempo: 3200,
      }
    : {
        web: Number(process.env.PORT ?? previous?.ports.web ?? 0),
        inspector: 0,
        oauth: 0,
        mailpit: 0,
        grafana: 0,
        otlp: 0,
        tempo: 0,
      };
  if (!tablecastContainer && (process.env.PORT || process.env.TABLECAST_LOCAL_BUILD === "1")) {
    // Dockerが割り当てた公開ポートを参照し、予約と競合処理を再実装しない。
    for (const [key, service, port] of [
      ["mailpit", "tablecast-mailpit", 8025],
      ["grafana", "tablecast-lgtm", 3000],
      ["otlp", "tablecast-lgtm", 4318],
      ["tempo", "tablecast-lgtm", 3200],
    ] as const) {
      const { stdout } = await execute(
        "docker",
        ["compose", "--env-file", join(tablecastLocal, ".env"), "port", service, String(port)],
        { cwd: tablecastRoot },
      );
      ports[key] = z
        .number()
        .int()
        .min(1)
        .max(65535)
        .parse(Number(stdout.trim().split(":").at(-1)));
    }
  }
  const runtime = runtimeSchema.parse({
    id: tablecastId,
    root: tablecastRoot,
    origin,
    ports,
    state: join(tablecastLocal, "state"),
    apiConfig: join(tablecastLocal, "api.wrangler.json"),
  });
  assertLocalRuntime(runtime, tablecastRoot, origin);
  await writeFile(join(tablecastLocal, "runtime.json"), JSON.stringify(runtime, null, 2) + "\n", {
    mode: 0o600,
  });
  return runtime;
}

// Bunが読み込んだ開発設定のうち、起動所有者へ必要な値だけを渡す。
export function developmentSecrets() {
  return Object.fromEntries(
    ["TABLECAST_MODEL_API_KEY", "TABLECAST_MODEL", "TABLECAST_OTEL_CAPTURE_CONTENT"].flatMap(
      (key) => (process.env[key] ? [[key, process.env[key]]] : []),
    ),
  );
}

export async function writeLocalConfigs(runtime: TablecastRuntime) {
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
          ? `http://127.0.0.1:${runtime.ports.oauth}`
          : await serviceOrigin("oauth"),
        ...(tablecastContainer
          ? { TABLECAST_GOOGLE_AUTHORIZE_URL: `${runtime.origin}/_tablecast/oauth` }
          : {}),
        TABLECAST_MAILPIT_URL: tablecastContainer
          ? `http://127.0.0.1:${runtime.ports.mailpit}`
          : await serviceOrigin("mailpit"),
        TABLECAST_EMAIL_FROM: "tablecast@localhost.test",
      },
      database: { name: `tablecast-${runtime.id}`, id: "00000000-0000-4000-8000-000000000000" },
      bucket: `tablecast-${runtime.id}-media`,
    },
    web: { name: `tablecast-${runtime.id}-web`, api: apiName, vars: telemetryVars },
  };
  // SDKが必要とするAPI設定だけを、workspaceの正本から一方向に変換する。
  await writeFile(
    runtime.apiConfig,
    JSON.stringify(apiSdkConfiguration(configuration.api), null, 2) + "\n",
  );
  const secretPath = join(tablecastLocal, ".dev.vars");
  let previous: ReturnType<typeof parseEnv> = {};
  try {
    previous = parseEnv(await readFile(secretPath, "utf8"));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const values: Record<string, string> = {
    TABLECAST_OTEL_CAPTURE_CONTENT: external.TABLECAST_OTEL_CAPTURE_CONTENT ?? "false",
    TABLECAST_VOICE_ENABLED: ["TABLECAST_MODEL_API_KEY", "TABLECAST_MODEL"]
      .every((key) => Boolean(external[key]))
      .toString(),
    TABLECAST_AUTH_SECRET: previous.TABLECAST_AUTH_SECRET ?? randomUUID().replaceAll("-", ""),
  };
  for (const key of [
    "TABLECAST_OTEL_CAPTURE_CONTENT",
    "TABLECAST_MODEL",
    "TABLECAST_MODEL_API_KEY",
  ]) {
    if (external[key]) values[key] = external[key];
  }
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
    TABLECAST_INSPECTOR_PORT: String(runtime.ports.inspector),
    HOST: tablecastContainer ? "0.0.0.0" : "127.0.0.1",
    ...(tablecastContainer
      ? { PORT: String(runtime.ports.web), TABLECAST_OAUTH_PORT: String(runtime.ports.oauth) }
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
    TABLECAST_API_PORT: "3003",
    WRANGLER_REGISTRY_PATH: join(tablecastLocal, "tablecast-wrangler-registry"),
    BUN_CONFIG_NO_CLEAR_TERMINAL: "true",
  });
}

if (import.meta.main) {
  process.umask(0o077);
  const runtime = await prepareRuntime();
  await migrateLocalDatabase(
    runtime.state,
    join(tablecastLocal, "tablecast-cf-state-migration.json"),
  );
  await writeLocalConfigs(runtime);
  console.info(`TableCast: ${runtime.origin}`);
}
