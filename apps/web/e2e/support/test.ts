import { test as base } from "@playwright/test";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { access, constants, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { z } from "zod";
import { diagnosticSecrets, redactCredentials } from "../../../api/src/platform/diagnostics";
import { startGateway } from "./gateway";
import { createWorkerRuntime, credentials, runtime as template, type CaseRuntime } from "./runtime";

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

type RuntimeHandles = CaseRuntime & {
  setOnline: (online: boolean) => Promise<void>;
  restartWeb: () => Promise<void>;
  prepareForTest: () => Promise<void>;
  flushLog: (path: string) => Promise<void>;
};

export const test = base.extend<{ runtime: RuntimeHandles }, { workerRuntime: RuntimeHandles }>({
  workerRuntime: [
    async ({ browserName }, use, workerInfo) => {
      const runtime = createWorkerRuntime(workerInfo.parallelIndex);
      let gateway: Awaited<ReturnType<typeof startGateway>> | undefined;
      const name = `${basename(runtime.directory).toLowerCase()}-${browserName}`;
      const children: ChildProcess[] = [];
      const expectedStops = new Set<ChildProcess>();
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
      record(
        JSON.stringify({
          worker: name,
          directory: runtime.directory,
          parallelIndex: workerInfo.parallelIndex,
        }),
      );
      let failure: Error | undefined;
      const start = (command: string, args: string[], env: NodeJS.ProcessEnv = {}) => {
        const child = spawn(command, args, {
          cwd: runtime.directory,
          env: {
            ...parentEnv,
            WRANGLER_LOG_PATH: join(runtime.directory, "wrangler.log"),
            // 別workerのWorker登録・解除で、このruntimeを再構成させない。
            WRANGLER_REGISTRY_PATH: join(runtime.directory, "registry"),
            ...env,
          },
          // worker専用のprocess groupで、Viteが起動するworkerdも同じ寿命にする。
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
        throw new Error(`worker専用process group ${child.pid}の終了を確認できませんでした。`);
      };
      const waitFor = async <T>(check: () => Promise<T | undefined>): Promise<T> => {
        const deadline = Date.now() + 60_000;
        while (Date.now() < deadline) {
          if (failure) throw failure;
          const result = await check();
          if (result !== undefined) return result;
          await delay(50);
        }
        throw new Error("worker runtimeの起動完了を確認できませんでした。");
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
      const state = join(runtime.directory, "state");
      let mailpitUrl = "";
      let ingress: Awaited<ReturnType<typeof startGateway>> | undefined;
      let webProcess: ChildProcess | undefined;
      let testsPrepared = 0;
      let mailpitMode: "binary" | "docker" = "binary";
      const container = `${name}-mailpit`;
      const waitUntilReady = async (origin: string) => {
        const deadline = Date.now() + 60_000;
        let ready = false;
        while (Date.now() < deadline) {
          if (failure) throw failure;
          try {
            const results = await Promise.all([
              fetch(`${origin}/api/admin/stores`, { signal: AbortSignal.timeout(2000) }),
              fetch(`${mailpitUrl}/api/v1/info`, {
                signal: AbortSignal.timeout(2000),
              }),
              fetch(`${oauthUrl}/.well-known/openid-configuration`, {
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
        if (!ready) throw new Error("worker専用の受入環境を起動できませんでした。");
      };
      let oauthUrl = "";
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
      const resetPersistedState = async () => {
        // writerを止めてからtemplateのD1/R2/DOを差し替える。稼働中のSQLiteはコピーしない。
        if (!ingress || !webProcess) throw new Error("worker runtimeが未起動です。");
        ingress.setOnline(false);
        await stop(webProcess);
        const stopped = children.indexOf(webProcess);
        if (stopped >= 0) children.splice(stopped, 1);
        await rm(join(runtime.directory, "web-ready.json"), { force: true });
        await rm(state, { recursive: true, force: true });
        await cp(join(template.directory, "state"), state, { recursive: true });
        const cleared = await fetch(`${mailpitUrl}/api/v1/messages`, { method: "DELETE" }).catch(
          () => undefined,
        );
        if (cleared && !cleared.ok)
          throw new Error(`Mailpitのメッセージ削除に失敗しました: ${cleared.status}`);
        webProcess = startWeb();
        const replacement = z
          .object({ port: z.number().int().positive() })
          .parse(await readReady("web-ready.json"));
        ingress.setWebPort(replacement.port);
        ingress.setOnline(true);
        await waitUntilReady(ingress.origin);
      };
      try {
        ingress = await startGateway(runtime.directory);
        gateway = ingress;
        const origin = ingress.origin;
        record(JSON.stringify({ origin }));
        await cp(join(template.directory, "state"), state, { recursive: true });
        start("bun", ["--no-env-file", join(root, "apps/emulate/src/index.ts")], {
          TABLECAST_PUBLIC_ORIGIN: origin,
          TABLECAST_OAUTH_PORT: String(
            z.coerce
              .number()
              .int()
              .min(1024)
              .max(65535)
              .parse(
                Number(parentEnv.TABLECAST_E2E_OAUTH_BASE_PORT ?? 24000) + workerInfo.parallelIndex,
              ),
          ),
          TABLECAST_OAUTH_READY_FILE: join(runtime.directory, "oauth-ready.json"),
        });
        const oauth = z.object({ url: z.url() }).parse(await readReady("oauth-ready.json"));
        oauthUrl = oauth.url;
        const linux = process.platform === "linux";
        const mailpitBin = join(template.directory, "mailpit");
        if (linux) {
          try {
            await access(mailpitBin, constants.X_OK);
          } catch {
            throw new Error(
              `Mailpitバイナリがありません: ${mailpitBin}。global setupでDocker imageから抽出してください。`,
            );
          }
          const mailpitPort = z.coerce
            .number()
            .int()
            .min(1024)
            .max(65535)
            .parse(
              Number(parentEnv.TABLECAST_E2E_MAILPIT_BASE_PORT ?? 25000) + workerInfo.parallelIndex,
            );
          const smtpPort = z.coerce
            .number()
            .int()
            .min(1024)
            .max(65535)
            .parse(
              Number(parentEnv.TABLECAST_E2E_SMTP_BASE_PORT ?? 26000) + workerInfo.parallelIndex,
            );
          start(
            mailpitBin,
            [
              "--listen",
              `127.0.0.1:${mailpitPort}`,
              "--smtp",
              `127.0.0.1:${smtpPort}`,
              "--disable-version-check",
            ],
            { MP_DISABLE_VERSION_CHECK: "true" },
          );
          mailpitUrl = `http://127.0.0.1:${mailpitPort}`;
        } else {
          // Docker imageのバイナリはLinux向けのため、macOS等ではcontainerをworker寿命で1回起動する。
          mailpitMode = "docker";
          start("docker", [
            "run",
            "--name",
            container,
            "-e",
            "MP_DISABLE_VERSION_CHECK=true",
            "-p",
            "127.0.0.1::8025",
            "axllent/mailpit:v1.29.2",
          ]);
          const mailpitPort = await waitFor(async () => {
            const result = await execute(
              "docker",
              ["inspect", "--format", "{{json .NetworkSettings.Ports}}", container],
              { timeout: 2000 },
            ).catch(() => undefined);
            if (!result) return undefined;
            const ports = z
              .record(
                z.string(),
                z.array(z.object({ HostPort: z.coerce.number().int().positive() })).nullable(),
              )
              .parse(JSON.parse(result.stdout));
            return ports["8025/tcp"]?.[0]?.HostPort;
          });
          mailpitUrl = `http://127.0.0.1:${mailpitPort}`;
        }
        await waitFor(async () => {
          try {
            const response = await fetch(`${mailpitUrl}/api/v1/info`, {
              signal: AbortSignal.timeout(2000),
            });
            return response.ok ? true : undefined;
          } catch {
            return undefined;
          }
        });
        record(JSON.stringify({ mailpitMode, mailpitUrl }));
        const vars = {
          TABLECAST_ENV: "development",
          TABLECAST_PUBLIC_ORIGIN: origin,
          TABLECAST_AUTH_SECRET: "tablecast-isolated-e2e-auth-secret-never-used-outside-tests",
          TABLECAST_RELEASE_SHA: "tablecast-e2e",
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
        webProcess = startWeb();
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
        await waitUntilReady(ingress.origin);
        const handles: RuntimeHandles = {
          ...runtime,
          origin,
          mailpitUrl,
          restartWeb: async () => {
            if (!ingress || !webProcess) throw new Error("worker runtimeが未起動です。");
            ingress.setOnline(false);
            await stop(webProcess);
            const stopped = children.indexOf(webProcess);
            if (stopped >= 0) children.splice(stopped, 1);
            await rm(join(runtime.directory, "web-ready.json"), { force: true });
            webProcess = startWeb();
            const replacement = z
              .object({ port: z.number().int().positive() })
              .parse(await readReady("web-ready.json"));
            ingress.setWebPort(replacement.port);
            ingress.setOnline(true);
          },
          setOnline: async (online) => {
            ingress?.setOnline(online);
          },
          prepareForTest: async () => {
            if (testsPrepared++ === 0) return;
            await resetPersistedState();
          },
          flushLog: async (path: string) => {
            await mkdir(dirname(path), { recursive: true });
            await writeFile(path, log, { mode: 0o600 });
          },
        };
        await use(handles);
        if (failure) throw failure;
      } catch (error) {
        errors.push(error);
      } finally {
        const cleanup = await Promise.allSettled([
          gateway?.close(),
          ...children.toReversed().map(stop),
          mailpitMode === "docker"
            ? execute("docker", ["rm", "--force", container], { timeout: 10000 }).catch(
                (error: Error) => {
                  if (!error.message.includes(`No such container: ${container}`)) throw error;
                },
              )
            : Promise.resolve(),
        ]);
        for (const result of cleanup) if (result.status === "rejected") errors.push(result.reason);
        try {
          if (errors.length) {
            for (const error of errors)
              record(error instanceof Error ? error.message : String(error));
            const path = join(
              root,
              "apps/web/test-results/tablecast-runtime",
              `${name}-worker.log`,
            );
            await mkdir(dirname(path), { recursive: true });
            await writeFile(path, log, { mode: 0o600 });
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
      if (errors.length) throw new AggregateError(errors, "worker専用の受入環境で失敗しました。");
    },
    { scope: "worker", timeout: 180_000 },
  ],
  runtime: [
    async ({ workerRuntime }, use, testInfo) => {
      await workerRuntime.prepareForTest();
      try {
        await use(workerRuntime);
      } finally {
        if (testInfo.status !== testInfo.expectedStatus) {
          const path = testInfo.outputPath("tablecast-runtime.log");
          try {
            await workerRuntime.flushLog(path);
            await testInfo.attach("TableCast実行環境", { path, contentType: "text/plain" });
          } catch {
            // 失敗証跡の添付自体でテスト結果を上書きしない。
          }
        }
      }
    },
    { timeout: 120_000 },
  ],
  baseURL: async ({ runtime }, use) => {
    await use(runtime.origin);
  },
});
