import { test as base } from "@playwright/test";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { z } from "zod";
import { diagnosticSecrets, redactCredentials } from "../../../api/src/platform/diagnostics";
import { startGateway } from "./gateway";
import { createCaseRuntime, credentials, runtime as template, type CaseRuntime } from "./runtime";

// API client由来のWorker global型ではprocessがanyになる。fixtureの実行環境はNodeである。
declare const process: NodeJS.Process;
const execute = promisify(execFile);
const parentEnv = z.record(z.string(), z.string().optional()).parse({ ...process.env });
const root = resolve(import.meta.dirname, "../../../..");
const builtConfig = z
  .object({
    main: z.string(),
    assets: z.object({ directory: z.string() }).optional(),
  })
  .catchall(z.json());

function signalGroup(child: ChildProcess, signal: NodeJS.Signals | 0) {
  if (!child.pid) return false;
  try {
    process.kill(-child.pid, signal);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") return false;
    // macOSはreap前のzombieだけのgroupにもEPERMを返す。消滅の確認まで待つ。
    if (signal === 0 && error instanceof Error && "code" in error && error.code === "EPERM")
      return true;
    throw error;
  }
}

export const test = base.extend<{
  releaseSha: string;
  runtime: CaseRuntime & {
    setOnline: (online: boolean) => Promise<void>;
    restartWeb: () => Promise<void>;
  };
}>({
  releaseSha: ["tablecast-e2e", { option: true }],
  runtime: [
    async ({ browserName, releaseSha }, use, testInfo) => {
      const runtime = createCaseRuntime();
      let gateway: Awaited<ReturnType<typeof startGateway>> | undefined;
      const name = `${basename(runtime.directory).toLowerCase()}-${browserName}`;
      const children: ChildProcess[] = [];
      const expectedStops = new Set<ChildProcess>();
      const container = `${name}-mailpit`;
      const errors: unknown[] = [];
      const secrets = [
        ...diagnosticSecrets(parentEnv),
        credentials.password,
        credentials.otherPassword,
        "tablecast-isolated-e2e-auth-secret-never-used-outside-tests",
        "tablecast-local-google-secret",
      ];
      let log = "";
      const record = (message: string) => {
        // 資格を除去してから上限を適用し、値の途中だけが証跡へ残るのを避ける。
        log = `${log}${redactCredentials(message, secrets)}\n`.slice(-65_536);
      };
      record(JSON.stringify({ case: name, directory: runtime.directory }));
      let failure: Error | undefined;
      const start = (command: string, args: string[], env: NodeJS.ProcessEnv = {}) => {
        const child = spawn(command, args, {
          cwd: runtime.directory,
          env: {
            ...parentEnv,
            WRANGLER_LOG_PATH: join(runtime.directory, "wrangler.log"),
            // 別caseのWorker登録・解除で、このruntimeを再構成させない。
            WRANGLER_REGISTRY_PATH: join(runtime.directory, "registry"),
            ...env,
          },
          // case専用のprocess groupで、Viteが起動するworkerdも同じ寿命にする。
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
        });
        record(`${command}: 起動 pid=${child.pid ?? "未取得"}`);
        for (const stream of [child.stdout, child.stderr])
          createInterface({ input: stream }).on("line", (line) => record(`${command}: ${line}`));
        child.once("error", (error) => {
          failure = error;
          record(`${command}: ${error.message}`);
        });
        child.once("exit", (code, signal) => {
          record(`${command}: 終了 pid=${child.pid} code=${code} signal=${signal}`);
          if (!expectedStops.has(child))
            failure ??= new Error(`${command}が起動中に終了しました: ${code ?? signal}`);
        });
        children.push(child);
        return child;
      };
      const stop = async (child: ChildProcess) => {
        expectedStops.add(child);
        // 親が先に終了していても、同じgroupに残る子孫を停止する。
        for (const signal of ["SIGTERM", "SIGKILL"] as const) {
          if (!signalGroup(child, signal)) return;
          record(`process group ${child.pid}: ${signal}`);
          const deadline = Date.now() + 5000;
          while (Date.now() < deadline) {
            if (!signalGroup(child, 0)) return;
            await delay(50);
          }
        }
        throw new Error(`case専用process group ${child.pid}の終了を確認できませんでした。`);
      };
      const waitFor = async <T>(check: () => Promise<T | undefined>): Promise<T> => {
        const deadline = Date.now() + 60_000;
        while (Date.now() < deadline) {
          if (failure) throw failure;
          const result = await check();
          if (result !== undefined) return result;
          await delay(50);
        }
        throw new Error("ケースの起動完了を確認できませんでした。");
      };
      const readReady = (file: string) =>
        waitFor(async () => {
          try {
            const data: unknown = JSON.parse(await readFile(join(runtime.directory, file), "utf8"));
            return data;
          } catch (error) {
            if (error instanceof Error && "code" in error && error.code === "ENOENT")
              return undefined;
            throw error;
          }
        });
      try {
        const ingress = await startGateway(runtime.directory);
        gateway = ingress;
        const origin = ingress.origin;
        record(JSON.stringify({ origin }));
        const state = join(runtime.directory, "state");
        // writerをdispose済みのtemplate全体を複製する。稼働中のSQLiteはコピーしない。
        await cp(join(template.directory, "state"), state, { recursive: true });
        start("bun", ["--no-env-file", join(root, "apps/emulate/src/index.ts")], {
          TABLECAST_PUBLIC_ORIGIN: origin,
          TABLECAST_OAUTH_PORT: "0",
          TABLECAST_OAUTH_READY_FILE: join(runtime.directory, "oauth-ready.json"),
        });
        const oauth = z.object({ url: z.url() }).parse(await readReady("oauth-ready.json"));
        const linux = process.platform === "linux";
        start("docker", [
          "run",
          "--name",
          container,
          "-e",
          "MP_DISABLE_VERSION_CHECK=true",
          ...(linux
            ? [
                "--network",
                "host",
                // 既定healthcheckはport 0へ接続するため、下の実URLのready判定へ任せる。
                "--no-healthcheck",
                "-e",
                "MP_UI_BIND_ADDR=127.0.0.1:0",
                "-e",
                "MP_SMTP_BIND_ADDR=unix:/tmp/tablecast-mailpit-smtp.sock:600",
              ]
            : ["-p", "127.0.0.1::8025"]),
          "axllent/mailpit:v1.29.2",
        ]);
        const mailpitPort = await waitFor(async () => {
          // 起動をやり直さず、起動済みcontainerの実bindだけを取得する。
          const result = await execute(
            "docker",
            linux
              ? ["exec", container, "netstat", "-ltnp"]
              : ["inspect", "--format", "{{json .NetworkSettings.Ports}}", container],
            { timeout: 2000 },
          ).catch(() => undefined);
          if (!result) return undefined;
          if (linux) {
            // host networkの他プロセスを候補にせず、containerのPID 1を照合する。
            const matches = [
              ...result.stdout.matchAll(
                /^tcp\s+\d+\s+\d+\s+127\.0\.0\.1:(\d+)\s+\S+\s+LISTEN\s+1\/mailpit\s*$/gm,
              ),
            ];
            if (matches.length > 1) throw new Error("MailpitのHTTP待受が一つに定まりません。");
            return matches[0] ? z.coerce.number().int().positive().parse(matches[0][1]) : undefined;
          }
          const ports = z
            .record(
              z.string(),
              z.array(z.object({ HostPort: z.coerce.number().int().positive() })).nullable(),
            )
            .parse(JSON.parse(result.stdout));
          return ports["8025/tcp"]?.[0]?.HostPort;
        });
        const mailpitUrl = `http://127.0.0.1:${mailpitPort}`;
        const vars = {
          TABLECAST_ENV: "development",
          TABLECAST_PUBLIC_ORIGIN: origin,
          TABLECAST_AUTH_SECRET: "tablecast-isolated-e2e-auth-secret-never-used-outside-tests",
          TABLECAST_RELEASE_SHA: releaseSha,
          TABLECAST_VOICE_ENABLED: "false",
          TABLECAST_GOOGLE_EMULATOR_URL: oauth.url,
          TABLECAST_GOOGLE_AUTHORIZE_URL: oauth.url,
          TABLECAST_MAILPIT_URL: mailpitUrl,
          TABLECAST_EMAIL_FROM: "TableCast <tablecast@example.test>",
        };
        for (const [directory, worker] of [
          ["server", "web"],
          ["tablecast_api", "api"],
        ] as const) {
          const build = join(template.directory, "build", directory);
          const config = builtConfig.parse(
            JSON.parse(await readFile(join(build, "wrangler.json"), "utf8")),
          );
          if (config.assets)
            await cp(resolve(build, config.assets.directory), join(runtime.directory, "client"), {
              recursive: true,
            });
          await writeFile(
            join(runtime.directory, `${worker}.json`),
            JSON.stringify({
              ...config,
              name: `${name}-${worker}`,
              main: resolve(build, config.main),
              ...(config.assets
                ? { assets: { ...config.assets, directory: join(runtime.directory, "client") } }
                : {}),
              ...(worker === "web"
                ? { services: [{ binding: "TABLECAST_API", service: `${name}-api` }] }
                : {
                    vars,
                    d1_databases: [
                      {
                        binding: "TABLECAST_DB",
                        database_name: "tablecast-e2e",
                        database_id: "00000000-0000-0000-0000-000000000002",
                      },
                    ],
                  }),
              dev: { port: 0, inspector_port: 0 },
            }),
          );
        }
        const deploy = join(runtime.directory, ".wrangler/deploy");
        await mkdir(deploy, { recursive: true });
        await writeFile(
          join(deploy, "config.json"),
          JSON.stringify({
            configPath: join(runtime.directory, "web.json"),
            auxiliaryWorkers: [{ configPath: join(runtime.directory, "api.json") }],
          }),
        );
        const startWeb = () =>
          start(
            "node",
            [
              join(root, "apps/web/node_modules/.bin/vite"),
              "preview",
              "--config",
              join(import.meta.dirname, "tablecast-preview.config.ts"),
              "--host",
              "127.0.0.1",
              "--port",
              "0",
              "--strictPort",
              "--logLevel",
              "warn",
            ],
            { TABLECAST_E2E_CASE_DIRECTORY: runtime.directory },
          );
        let webProcess = startWeb();
        const web = z
          .object({ port: z.number().int().positive() })
          .parse(await readReady("web-ready.json"));
        ingress.setWebPort(web.port);
        record(
          JSON.stringify({
            origin,
            webPort: web.port,
            oauth: oauth.url,
            mailpit: mailpitUrl,
          }),
        );
        const deadline = Date.now() + 60_000;
        let ready = false;
        while (Date.now() < deadline) {
          if (failure) throw failure;
          try {
            const results = await Promise.all([
              fetch(`${origin}/api/admin/stores`, { signal: AbortSignal.timeout(2000) }),
              fetch(`${vars.TABLECAST_MAILPIT_URL}/api/v1/info`, {
                signal: AbortSignal.timeout(2000),
              }),
              fetch(`${vars.TABLECAST_GOOGLE_EMULATOR_URL}/.well-known/openid-configuration`, {
                signal: AbortSignal.timeout(2000),
              }),
            ]);
            if (results[0]?.status === 401 && results[1]?.ok && results[2]?.ok) {
              ready = true;
              break;
            }
          } catch {}
          await new Promise((done) => setTimeout(done, 100));
        }
        if (!ready) throw new Error("case専用の受入環境を起動できませんでした。");
        await use({
          ...runtime,
          origin,
          mailpitUrl,
          restartWeb: async () => {
            ingress.setOnline(false);
            await stop(webProcess);
            await rm(join(runtime.directory, "web-ready.json"));
            webProcess = startWeb();
            const replacement = z
              .object({ port: z.number().int().positive() })
              .parse(await readReady("web-ready.json"));
            ingress.setWebPort(replacement.port);
            ingress.setOnline(true);
          },
          setOnline: async (online) => {
            ingress.setOnline(online);
          },
        });
        if (failure) throw failure;
      } catch (error) {
        errors.push(error);
      } finally {
        const cleanup = await Promise.allSettled([
          gateway?.close(),
          ...children.toReversed().map(stop),
          execute("docker", ["rm", "--force", container], { timeout: 10000 }).catch(
            (error: Error) => {
              if (!error.message.includes(`No such container: ${container}`)) throw error;
            },
          ),
        ]);
        for (const result of cleanup) if (result.status === "rejected") errors.push(result.reason);
        try {
          if (errors.length || testInfo.status !== testInfo.expectedStatus) {
            for (const error of errors)
              record(error instanceof Error ? error.message : String(error));
            const path = testInfo.outputPath("tablecast-runtime.log");
            await mkdir(dirname(path), { recursive: true });
            await writeFile(path, log, { mode: 0o600 });
            await testInfo.attach("TableCast実行環境", { path, contentType: "text/plain" });
          }
        } catch (error) {
          errors.push(error);
        } finally {
          try {
            await rm(runtime.directory, { recursive: true, force: true });
          } catch (error) {
            errors.push(error);
          }
        }
      }
      if (errors.length) throw new AggregateError(errors, "case専用の受入環境で失敗しました。");
    },
    { timeout: 120_000 },
  ],
  baseURL: async ({ runtime }, use) => {
    await use(runtime.origin);
  },
});
