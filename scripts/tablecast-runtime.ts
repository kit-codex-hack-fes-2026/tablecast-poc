import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readlink, realpath, symlink, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import process from "node:process";
import { parseEnv, promisify } from "node:util";
import { apiSdkConfiguration } from "../apps/api/cloudflare.config.ts";
import {
  modeOptions,
  tablecastBillingSecrets,
  tablecastBillingVars,
} from "./tablecast-deploy-config.ts";

const execute = promisify(execFile);
export const tablecastRoot = await realpath(resolve(import.meta.dirname, ".."));
export const tablecastLocal = join(tablecastRoot, ".local");
export const tablecastContainer = process.env.TABLECAST_CONTAINER === "1";
const environmentPath = join(tablecastLocal, ".env");
const state = join(tablecastLocal, "state");
const readEnv = async (path: string) =>
  (await Bun.file(path).exists()) ? parseEnv(await Bun.file(path).text()) : {};

export async function assertPrepared() {
  const saved = await readEnv(environmentPath);
  if (
    saved.TABLECAST_WORKTREE_NAME !== process.env.TABLECAST_WORKTREE_NAME ||
    saved.TABLECAST_STATE_PATH !== state ||
    (process.env.TABLECAST_PUBLIC_ORIGIN !== undefined &&
      saved.TABLECAST_PUBLIC_ORIGIN !== process.env.TABLECAST_PUBLIC_ORIGIN)
  )
    throw new Error(
      "このworktreeの設定が異なります。停止後に bun run demo:reset を実行してください。",
    );
}

export async function portAvailable(port: number): Promise<boolean> {
  if (!port) return true;
  return new Promise((done) => {
    const server = createServer();
    server.once("error", () => done(false));
    server.listen(port, "127.0.0.1", () => server.close(() => done(true)));
  });
}

export async function localReleaseSha(root: string) {
  const [{ stdout: sha }, { stdout: status }] = await Promise.all([
    execute("git", ["rev-parse", "HEAD"], { cwd: root }),
    execute("git", ["status", "--porcelain", "--untracked-files=normal"], { cwd: root }),
  ]);
  return `${sha.trim()}${status ? "-dirty" : ""}`;
}

export function developmentSecrets() {
  return Object.fromEntries(
    [
      "TABLECAST_MODEL_API_KEY",
      "TABLECAST_MODEL",
      "TABLECAST_OTEL_CAPTURE_CONTENT",
      ...tablecastBillingVars,
      ...tablecastBillingSecrets,
    ].flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])),
  );
}

if (import.meta.main) {
  process.umask(0o077);
  const saved = await readEnv(environmentPath);
  if (!(await portAvailable(Number(saved.TABLECAST_WEB_PORT ?? 0))))
    throw new Error("このworktreeの開発プロセスをCtrl+Cで停止してから初期化してください。");
  const name = process.env.TABLECAST_WORKTREE_NAME;
  if (!name) throw new Error("package scriptから開発設定を生成してください。");
  let resource = name;
  if (tablecastContainer) {
    // Dev Containerの既存資源名は維持する。
    const { stdout } = await execute("git", ["rev-parse", "--git-common-dir"], {
      cwd: tablecastRoot,
    });
    const common = await realpath(resolve(tablecastRoot, stdout.trim()));
    resource = createHash("sha256")
      .update(`${common}\0${tablecastRoot}`)
      .digest("hex")
      .slice(0, 10);
  }
  if (await Bun.file(environmentPath).exists()) {
    if (saved.TABLECAST_RESOURCE_NAME !== resource && !process.argv.includes("--reset"))
      throw new Error(
        "開発資源の名前が変わりました。停止後に bun run demo:reset を実行してください。",
      );
  }
  const { stdout } = tablecastContainer
    ? { stdout: process.env.TABLECAST_CONTAINER_ORIGIN ?? "http://localhost:3000" }
    : await execute(
        "bunx",
        ["--no-install", "portless", "get", `web.${process.env.TABLECAST_HOST}`, "--no-worktree"],
        { cwd: tablecastRoot },
      );
  const origin = new URL(stdout.trim());
  if (
    tablecastContainer
      ? !["localhost", "127.0.0.1"].includes(origin.hostname) &&
        !origin.hostname.endsWith(".localhost") &&
        !origin.hostname.endsWith(".orb.local")
      : origin.protocol !== "http:" ||
        (origin.port || "80") !== (process.env.PORTLESS_PORT ?? "80") ||
        origin.hostname !== `web.${process.env.TABLECAST_HOST}.localhost`
  )
    throw new Error("開発originが異なります。setupのPortless設定を確認してください。");
  const serviceOrigin = (service: string) => {
    const url = new URL(origin);
    url.hostname = `${service}.${process.env.TABLECAST_HOST}.localhost`;
    return url.origin;
  };
  const external = developmentSecrets();
  const voice = Boolean(
    external.TABLECAST_MODEL &&
    (external.TABLECAST_MODEL_API_KEY || external.TABLECAST_ORGANIZATION_AI_ENABLED === "true"),
  ).toString();
  const values: Record<string, string> = {
    ...Object.fromEntries(
      tablecastBillingVars.flatMap((key) =>
        external[key] === undefined ? [] : [[key, external[key]]],
      ),
    ),
    TABLECAST_WORKTREE_NAME: name,
    TABLECAST_RESOURCE_NAME: resource,
    TABLECAST_HOST: tablecastContainer
      ? `${name}.${process.env.TABLECAST_REPO_NAME}.container`
      : `${name}.tablecast-poc`,
    COMPOSE_PROJECT_NAME: `tablecast-${resource}`,
    TABLECAST_PUBLIC_ORIGIN: origin.origin,
    TABLECAST_RELEASE_SHA: await localReleaseSha(tablecastRoot),
    TABLECAST_STATE_PATH: state,
    TABLECAST_WEB_PORT: String(process.env.PORT ?? (tablecastContainer ? 3001 : 0)),
    TABLECAST_INSPECTOR_PORT: tablecastContainer ? "3002" : "0",
    TABLECAST_OTEL_ENDPOINT: tablecastContainer
      ? "http://tablecast-lgtm:4318"
      : serviceOrigin("otlp"),
    TABLECAST_GOOGLE_EMULATOR_URL: tablecastContainer
      ? "http://127.0.0.1:3008"
      : serviceOrigin("oauth"),
    ...(tablecastContainer
      ? {
          TABLECAST_GOOGLE_AUTHORIZE_URL: `${origin.origin}/_tablecast/oauth`,
          PORT: "3001",
          TABLECAST_OAUTH_PORT: "3008",
        }
      : {}),
    TABLECAST_MAILPIT_URL: tablecastContainer ? "http://127.0.0.1:8025" : serviceOrigin("mailpit"),
    TABLECAST_EMAIL_FROM: "tablecast@localhost.test",
    TABLECAST_VOICE_ENABLED: voice,
    TABLECAST_OTEL_CAPTURE_CONTENT: external.TABLECAST_OTEL_CAPTURE_CONTENT ?? "false",
    TABLECAST_GRAFANA_ORIGIN: tablecastContainer
      ? "http://tablecast-lgtm:3000"
      : serviceOrigin("grafana"),
    HOST: tablecastContainer ? "0.0.0.0" : "127.0.0.1",
    PORTLESS_HTTPS: "0",
    PORTLESS_PORT: process.env.PORTLESS_PORT ?? "80",
    WRANGLER_SEND_METRICS: "false",
    CLOUDFLARE_REGISTRY_PATH: join(tablecastLocal, "tablecast-wrangler-registry"),
    MINIFLARE_REGISTRY_PATH: join(tablecastLocal, "tablecast-wrangler-registry"),
    WRANGLER_REGISTRY_PATH: join(tablecastLocal, "tablecast-wrangler-registry"),
    BUN_CONFIG_NO_CLEAR_TERMINAL: "true",
  };
  await mkdir(tablecastLocal, { recursive: true, mode: 0o700 });
  const writeEnv = (path: string, entries: Record<string, string>) =>
    writeFile(
      path,
      Object.entries(entries)
        .map(([key, value]) => {
          if (value.includes("$"))
            throw new Error(`${key}はBunの変数展開を避けるため$を含められません。`);
          // dotenvはJSONの引用符エスケープを復元しないため、値に含まれない区切りを使う。
          const quote = ["'", "`", '"'].find(
            (candidate) =>
              !value.includes(candidate) && (candidate !== '"' || !/\\[nr]/.test(value)),
          );
          if (!quote) throw new Error(`${key}をdotenvへ保存できる引用形式がありません。`);
          return `${key}=${quote}${value}${quote}`;
        })
        .join("\n") + "\n",
      { mode: 0o600 },
    );
  const secretPath = join(tablecastLocal, ".dev.vars");
  const previous = await readEnv(secretPath);
  await writeEnv(secretPath, {
    ...external,
    TABLECAST_AUTH_SECRET: previous.TABLECAST_AUTH_SECRET ?? randomUUID().replaceAll("-", ""),
    TABLECAST_VOICE_ENABLED: voice,
    TABLECAST_OTEL_CAPTURE_CONTENT: external.TABLECAST_OTEL_CAPTURE_CONTENT ?? "false",
  });
  const webSecretPath = join(tablecastLocal, ".dev.vars.web");
  await writeEnv(webSecretPath, {
    TABLECAST_OTEL_CAPTURE_CONTENT: external.TABLECAST_OTEL_CAPTURE_CONTENT ?? "false",
  });
  for (const workspace of ["api", "web"]) {
    const workspaceSecretPath = workspace === "api" ? secretPath : webSecretPath;
    const link = join(tablecastRoot, "apps", workspace, ".dev.vars");
    try {
      await symlink(workspaceSecretPath, link);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
      const current = await readlink(link);
      if (current === workspaceSecretPath) continue;
      if (workspace === "web" && current === secretPath) {
        await unlink(link);
        await symlink(workspaceSecretPath, link);
      } else throw new Error("workspaceの.dev.varsが別の設定を参照しています。", { cause: error });
    }
  }
  await writeFile(
    join(tablecastLocal, "api.wrangler.json"),
    JSON.stringify(apiSdkConfiguration(modeOptions("api", "development", "", values)), null, 2) +
      "\n",
    { mode: 0o600 },
  );
  await writeEnv(environmentPath, values);
  console.info(`TableCast: ${origin.origin}`);
}
