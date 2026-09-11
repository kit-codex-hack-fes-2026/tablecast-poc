import process from "node:process";
import { createHash, randomUUID } from "node:crypto";
import { createSocket } from "node:dgram";
import { mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv, promisify } from "node:util";
import { execFile } from "node:child_process";
import { z } from "zod";
import { parse } from "jsonc-parser";
import type { ParseError } from "jsonc-parser";

const execute = promisify(execFile);
export const tablecastRoot = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const { stdout: tablecastCommonPath } = await execute("git", ["rev-parse", "--git-common-dir"], {
  cwd: tablecastRoot,
});
const tablecastCommon = await realpath(resolve(tablecastRoot, tablecastCommonPath.trim()));
export const tablecastContainer = process.env.TABLECAST_CONTAINER === "1";
export const tablecastLocal = join(tablecastRoot, ".local");
const portSchema = z.number().int().min(1024).max(65535);
const portsSchema = z.object({
  proxy: portSchema,
  web: portSchema,
  inspector: portSchema,
  signaling: portSchema,
  rtcTcp: portSchema,
  rtcUdp: portSchema,
  agent: portSchema,
  storybook: portSchema,
  oauth: portSchema.optional(),
  mailpit: portSchema.optional(),
  smtp: portSchema.optional(),
  grafana: portSchema.optional(),
  otlp: portSchema.optional(),
  tempo: portSchema.optional(),
});
const runtimeSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{10}$/),
  root: z.string(),
  origin: z.string().url(),
  ports: portsSchema,
  state: z.string(),
  apiConfig: z.string(),
  webConfig: z.string(),
  pid: z.number().int().positive().optional(),
  nonce: z.string().optional(),
  mode: z.enum(["development", "parity"]).optional(),
});
export type TablecastRuntime = z.infer<typeof runtimeSchema>;
const ledgerSchema = z.record(z.string(), z.object({ root: z.string(), ports: portsSchema }));

export function worktreeId(root: string, common: string) {
  return createHash("sha256").update(`${common}\0${root}`).digest("hex").slice(0, 10);
}

function domainLabel(value: string) {
  const name = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!name || name.length > 63)
    throw new Error("worktree名とrepo名には短い英数字の名前を使用してください。");
  return name;
}

export function worktreeHost(root: string, common = join(root, ".git")) {
  const repository = dirname(common);
  const worktree =
    root === repository
      ? "main"
      : basename(root) === basename(repository)
        ? basename(dirname(root))
        : basename(root);
  return `${domainLabel(worktree)}.${domainLabel(basename(repository))}`;
}

function localHost(root: string, common: string) {
  return tablecastContainer &&
    process.env.TABLECAST_WORKTREE_NAME &&
    process.env.TABLECAST_REPO_NAME
    ? `${domainLabel(process.env.TABLECAST_WORKTREE_NAME)}.${domainLabel(process.env.TABLECAST_REPO_NAME)}`
    : worktreeHost(root, common);
}

export async function localReleaseSha(root: string) {
  const [{ stdout: sha }, { stdout: status }] = await Promise.all([
    execute("git", ["rev-parse", "HEAD"], { cwd: root }),
    execute("git", ["status", "--porcelain", "--untracked-files=normal"], { cwd: root }),
  ]);
  return `${sha.trim()}${status ? "-dirty" : ""}`;
}

export function assertLocalRuntime(
  runtime: TablecastRuntime,
  root: string,
  common = root === tablecastRoot ? tablecastCommon : join(root, ".git"),
) {
  const local = join(root, ".local");
  if (
    runtime.root !== root ||
    runtime.state !== join(local, "state") ||
    runtime.apiConfig !== join(local, "api.wrangler.json") ||
    runtime.webConfig !== join(local, "web.wrangler.json") ||
    !(
      runtime.origin === `http://${localHost(root, common)}.localhost:${runtime.ports.proxy}` ||
      (tablecastContainer &&
        (runtime.origin === "http://localhost:3000" ||
          runtime.origin ===
            `http://${localHost(root, common)}.container.localhost:${new URL(runtime.origin).port}` ||
          runtime.origin === `https://${localHost(root, common)}.orb.local`))
    ) ||
    new Set(Object.values(runtime.ports)).size !== Object.values(runtime.ports).length
  ) {
    throw new Error("別worktree・非ローカル・不整合の設定を操作できません。");
  }
}

export async function readRuntime() {
  const value: unknown = JSON.parse(await readFile(join(tablecastLocal, "runtime.json"), "utf8"));
  const runtime = runtimeSchema.parse(value);
  assertLocalRuntime(runtime, tablecastRoot);
  return runtime;
}

export async function saveRuntime(runtime: TablecastRuntime) {
  assertLocalRuntime(runtime, tablecastRoot);
  await writeFile(join(tablecastLocal, "runtime.json"), JSON.stringify(runtime, null, 2) + "\n", {
    mode: 0o600,
  });
}

export async function portAvailable(port: number, udp = false): Promise<boolean> {
  return new Promise((done) => {
    if (udp) {
      const socket = createSocket("udp4");
      socket.once("error", () => {
        socket.close();
        done(false);
      });
      socket.bind(port, "127.0.0.1", () => {
        socket.close(() => done(true));
      });
    } else {
      const server = createServer();
      server.once("error", () => done(false));
      server.listen(port, "127.0.0.1", () => {
        server.close(() => done(true));
      });
    }
  });
}

export async function reserveRuntime() {
  await mkdir(tablecastLocal, { recursive: true, mode: 0o700 });
  const common = tablecastCommon;
  const id = worktreeId(tablecastRoot, common);
  if (tablecastContainer) {
    const runtime: TablecastRuntime = {
      id,
      root: tablecastRoot,
      ports: {
        proxy: 3000,
        web: 3001,
        inspector: 3002,
        signaling: 7880,
        rtcTcp: portSchema.parse(Number(process.env.TABLECAST_RTC_TCP_PORT ?? 7881)),
        rtcUdp: portSchema.parse(Number(process.env.TABLECAST_RTC_UDP_PORT ?? 7882)),
        agent: 8081,
        storybook: 6006,
        oauth: 3008,
        mailpit: 8025,
        smtp: 1025,
        grafana: 3030,
        otlp: 4318,
        tempo: 3200,
      },
      origin: process.env.TABLECAST_CONTAINER_ORIGIN || "http://localhost:3000",
      state: join(tablecastLocal, "state"),
      apiConfig: join(tablecastLocal, "api.wrangler.json"),
      webConfig: join(tablecastLocal, "web.wrangler.json"),
    };
    await saveRuntime(runtime);
    return runtime;
  }
  const lock = join(common, "tablecast-ports.lock");
  await mkdir(lock).catch(() => {
    throw new Error("ポート予約が使用中です。初期化の終了後に再試行してください。");
  });
  try {
    const ledgerPath = join(common, "tablecast-ports.json");
    let ledger: z.infer<typeof ledgerSchema> = {};
    try {
      const value: unknown = JSON.parse(await readFile(ledgerPath, "utf8"));
      ledger = ledgerSchema.parse(value);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    const host = worktreeHost(tablecastRoot, common);
    if (
      Object.values(ledger).some(
        (entry) => entry.root !== tablecastRoot && worktreeHost(entry.root, common) === host,
      )
    ) {
      throw new Error(
        "同じ開発ドメインになるworktreeがあります。worktreeのフォルダー名を変更してください。",
      );
    }
    const occupied = new Set(
      Object.entries(ledger)
        .filter(([key]) => key !== id)
        .flatMap(([, value]) => Object.values(value.ports)),
    );
    const existing = ledger[id]?.ports;
    const base = 20000 + (parseInt(id.slice(0, 6), 16) % 2500) * 8;
    let ports: z.infer<typeof portsSchema> | undefined;
    for (let attempt = 0; attempt < 200; attempt++) {
      const candidate =
        attempt === 0 &&
        existing?.oauth &&
        existing.mailpit &&
        existing.smtp &&
        existing.grafana &&
        existing.otlp &&
        existing.tempo
          ? existing
          : portsSchema.parse(
              Object.fromEntries(
                [
                  "proxy",
                  "web",
                  "inspector",
                  "signaling",
                  "rtcTcp",
                  "rtcUdp",
                  "agent",
                  "storybook",
                  "oauth",
                  "mailpit",
                  "smtp",
                  "grafana",
                  "otlp",
                  "tempo",
                ].map((key, index) => [
                  key,
                  20000 + ((base - 20000 + attempt * 8 + index) % 30000),
                ]),
              ),
            );
      if (Object.values(candidate).some((port) => occupied.has(port))) continue;
      const checks = await Promise.all(
        Object.values(candidate).flatMap((port) => [
          portAvailable(port),
          portAvailable(port, true),
        ]),
      );
      if (checks.every(Boolean)) {
        ports = candidate;
        break;
      }
    }
    if (!ports) throw new Error("利用可能なローカルポートを確保できません。");
    ledger[id] = { root: tablecastRoot, ports };
    await writeFile(ledgerPath, JSON.stringify(ledger, null, 2) + "\n");
    const runtime: TablecastRuntime = {
      id,
      root: tablecastRoot,
      ports,
      origin: `http://${host}.localhost:${ports.proxy}`,
      state: join(tablecastLocal, "state"),
      apiConfig: join(tablecastLocal, "api.wrangler.json"),
      webConfig: join(tablecastLocal, "web.wrangler.json"),
    };
    await saveRuntime(runtime);
    return runtime;
  } finally {
    await rm(lock, { recursive: true });
  }
}

export function localEnvironment(runtime: TablecastRuntime) {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    TMPDIR: process.env.TMPDIR ?? "/tmp",
    CI: process.env.CI ?? "",
    TABLECAST_PUBLIC_ORIGIN: runtime.origin,
    TABLECAST_WEB_CONFIG: runtime.webConfig,
    TABLECAST_API_CONFIG: runtime.apiConfig,
    TABLECAST_STATE_PATH: runtime.state,
    TABLECAST_INSPECTOR_PORT: String(runtime.ports.inspector),
    PORT: String(runtime.ports.web),
    HOST: tablecastContainer ? "0.0.0.0" : "127.0.0.1",
    TABLECAST_CONTAINER: tablecastContainer ? "1" : "0",
    TABLECAST_WORKTREE_NAME:
      process.env.TABLECAST_WORKTREE_NAME ??
      localHost(runtime.root, tablecastCommon).split(".")[0] ??
      "main",
    TABLECAST_REPO_NAME:
      process.env.TABLECAST_REPO_NAME ?? domainLabel(basename(dirname(tablecastCommon))),
    TABLECAST_CONTAINER_ORIGIN: runtime.origin,
    PORTLESS_PORT: String(runtime.ports.proxy),
    PORTLESS_STATE_DIR: join(tablecastLocal, "portless"),
    PORTLESS_SYNC_HOSTS: "0",
    PORTLESS_HTTPS: "0",
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_REGISTRY_PATH: join(tablecastLocal, "tablecast-wrangler-registry"),
    BUN_CONFIG_NO_CLEAR_TERMINAL: "true",
  };
  for (const key of [
    "UV_CACHE_DIR",
    "UV_PYTHON_INSTALL_DIR",
    "DOCKER_HOST",
    "DOCKER_CONTEXT",
    "DOCKER_CONFIG",
    "TABLECAST_RTC_TCP_PORT",
    "TABLECAST_RTC_UDP_PORT",
  ]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

// Bunが読み込んだ開発設定のうち、起動所有者へ必要な値だけを渡す。
export function developmentSecrets() {
  return Object.fromEntries(
    [
      "INWORLD_API_KEY",
      "TABLECAST_MODEL_API_KEY",
      "TABLECAST_INWORLD_VOICE_JA",
      "TABLECAST_INWORLD_VOICE_EN",
      "TABLECAST_INWORLD_VOICES_API_KEY",
      "TABLECAST_MODEL",
      "TABLECAST_OTEL_CAPTURE_CONTENT",
      "TABLECAST_MASTRA_ACCESS_TOKEN",
      "TABLECAST_MASTRA_PROJECT_ID",
      "TABLECAST_MASTRA_ENDPOINT",
    ].flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])),
  );
}

export async function writeLocalConfigs(runtime: TablecastRuntime) {
  const jsonRecord = z.record(z.string(), z.unknown());
  async function readConfig(path: string) {
    const errors: ParseError[] = [];
    const value: unknown = parse(await readFile(path, "utf8"), errors, {
      allowTrailingComma: true,
    });
    if (errors.length) throw new Error(`Wrangler設定のJSONCが不正です: ${path}`);
    return jsonRecord.parse(value);
  }
  const api = await readConfig(join(tablecastRoot, "apps/api/wrangler.jsonc"));
  const web = await readConfig(join(tablecastRoot, "apps/web/wrangler.jsonc"));
  const apiName = `tablecast-${runtime.id}-api`;
  const telemetryVars = {
    TABLECAST_ENV: "development",
    TABLECAST_RELEASE_SHA: await localReleaseSha(tablecastRoot),
    TABLECAST_OTEL_ENDPOINT: tablecastContainer
      ? "http://tablecast-lgtm:4318"
      : `http://127.0.0.1:${runtime.ports.otlp}`,
  };
  await writeFile(
    runtime.apiConfig,
    JSON.stringify(
      {
        ...api,
        name: apiName,
        main: join(tablecastRoot, "apps/api/src/worker.ts"),
        vars: {
          ...telemetryVars,
          TABLECAST_PUBLIC_ORIGIN: runtime.origin,
          TABLECAST_GOOGLE_EMULATOR_URL: `http://127.0.0.1:${runtime.ports.oauth}`,
          ...(tablecastContainer
            ? { TABLECAST_GOOGLE_AUTHORIZE_URL: `${runtime.origin}/_tablecast/oauth` }
            : {}),
          TABLECAST_MAILPIT_URL: `http://127.0.0.1:${runtime.ports.mailpit}`,
          TABLECAST_EMAIL_FROM: "tablecast@localhost.test",
        },
        d1_databases: [
          {
            binding: "TABLECAST_DB",
            database_name: `tablecast-${runtime.id}`,
            database_id: "00000000-0000-0000-0000-000000000000",
            migrations_dir: join(tablecastRoot, "apps/api/migrations"),
          },
        ],
        r2_buckets: [{ binding: "TABLECAST_MEDIA", bucket_name: `tablecast-${runtime.id}-media` }],
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    runtime.webConfig,
    JSON.stringify(
      {
        ...web,
        name: `tablecast-${runtime.id}-web`,
        main: join(tablecastRoot, "apps/web/src/server.ts"),
        services: [{ binding: "TABLECAST_API", service: apiName }],
        vars: telemetryVars,
      },
      null,
      2,
    ) + "\n",
  );
  const secretPath = join(tablecastLocal, ".dev.vars");
  let previous: ReturnType<typeof parseEnv> = {};
  try {
    previous = parseEnv(await readFile(secretPath, "utf8"));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const external = developmentSecrets();
  const values: Record<string, string> = {
    TABLECAST_OTEL_CAPTURE_CONTENT: external.TABLECAST_OTEL_CAPTURE_CONTENT ?? "false",
    TABLECAST_VOICE_ENABLED: [
      "INWORLD_API_KEY",
      "TABLECAST_INWORLD_VOICE_JA",
      "TABLECAST_INWORLD_VOICE_EN",
      "TABLECAST_MODEL_API_KEY",
    ]
      .every((key) => Boolean(external[key]))
      .toString(),
    TABLECAST_AUTH_SECRET: previous.TABLECAST_AUTH_SECRET ?? randomUUID().replaceAll("-", ""),
    TABLECAST_VOICE_API_TOKEN:
      previous.TABLECAST_VOICE_API_TOKEN ?? randomUUID().replaceAll("-", ""),
    TABLECAST_LIVEKIT_API_KEY: `tablecast-${runtime.id}`,
    TABLECAST_LIVEKIT_API_SECRET:
      previous.TABLECAST_LIVEKIT_API_SECRET ?? randomUUID().replaceAll("-", ""),
    TABLECAST_LIVEKIT_URL: tablecastContainer
      ? `${runtime.origin.replace(/^http/, "ws")}/_tablecast/livekit`
      : `ws://127.0.0.1:${runtime.ports.signaling}`,
  };
  for (const key of [
    "TABLECAST_MASTRA_ACCESS_TOKEN",
    "TABLECAST_MASTRA_PROJECT_ID",
    "TABLECAST_MASTRA_ENDPOINT",
    "TABLECAST_OTEL_CAPTURE_CONTENT",
    "TABLECAST_INWORLD_VOICES_API_KEY",
    "TABLECAST_MODEL",
    "TABLECAST_MODEL_API_KEY",
  ]) {
    if (external[key]) values[key] = external[key];
  }
  await writeFile(
    secretPath,
    Object.entries(values)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
}
