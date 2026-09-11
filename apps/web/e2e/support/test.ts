import { test as base } from "@playwright/test";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { z } from "zod";
import { createCaseRuntime, runtime as template, type CaseRuntime } from "./runtime";

const execute = promisify(execFile);
const parentEnv = z.record(z.string(), z.string().optional()).parse({ ...process.env });
const root = resolve(import.meta.dirname, "../../../..");
const builtConfig = z
  .object({
    main: z.string(),
    assets: z.object({ directory: z.string() }).optional(),
  })
  .catchall(z.json());

export const test = base.extend<{
  runtime: CaseRuntime & { setOnline: (online: boolean) => Promise<void> };
}>({
  runtime: [
    async ({ browserName }, use) => {
      const runtime = await createCaseRuntime();
      const name = `${basename(runtime.directory).toLowerCase()}-${browserName}`;
      const children: ChildProcess[] = [];
      const expectedStops = new Set<ChildProcess>();
      const container = `${name}-mailpit`;
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
          stdio: "inherit",
        });
        child.once("error", (error) => {
          failure = error;
        });
        child.once("exit", (code, signal) => {
          if (!expectedStops.has(child))
            failure ??= new Error(`${command}が起動中に終了しました: ${code ?? signal}`);
        });
        children.push(child);
        return child;
      };
      try {
        const state = join(runtime.directory, "state");
        // writerをdispose済みのtemplate全体を複製する。稼働中のSQLiteはコピーしない。
        await cp(join(template.directory, "state"), state, { recursive: true });
        const vars = {
          TABLECAST_ENV: "development",
          TABLECAST_PUBLIC_ORIGIN: runtime.origin,
          TABLECAST_AUTH_SECRET: "tablecast-isolated-e2e-auth-secret-never-used-outside-tests",
          TABLECAST_RELEASE_SHA: "tablecast-e2e",
          TABLECAST_VOICE_ENABLED: "false",
          TABLECAST_GOOGLE_EMULATOR_URL: `http://127.0.0.1:${runtime.ports.oauth}`,
          TABLECAST_GOOGLE_AUTHORIZE_URL: `http://127.0.0.1:${runtime.ports.oauth}`,
          TABLECAST_MAILPIT_URL: `http://127.0.0.1:${runtime.ports.mailpit}`,
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
        start("bun", ["--no-env-file", join(root, "apps/emulate/src/index.ts")], {
          TABLECAST_PUBLIC_ORIGIN: runtime.origin,
          TABLECAST_OAUTH_PORT: String(runtime.ports.oauth),
        });
        start("docker", [
          "run",
          "--name",
          container,
          "-e",
          "MP_DISABLE_VERSION_CHECK=true",
          // Linux runnerのveth生成・削除は他caseのChromiumへnetwork changeを通知する。
          ...(process.env.GITHUB_ACTIONS === "true" && process.platform === "linux"
            ? [
                "--network",
                "host",
                "-e",
                `MP_UI_BIND_ADDR=127.0.0.1:${runtime.ports.mailpit}`,
                "-e",
                "MP_SMTP_BIND_ADDR=127.0.0.1:0",
              ]
            : ["-p", `127.0.0.1:${runtime.ports.mailpit}:8025`]),
          "axllent/mailpit:v1.29.2",
        ]);
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
              String(runtime.ports.web),
              "--strictPort",
              "--logLevel",
              "warn",
            ],
            {
              TABLECAST_E2E_CASE_DIRECTORY: runtime.directory,
            },
          );
        let web = startWeb();
        const deadline = Date.now() + 60_000;
        let ready = false;
        while (Date.now() < deadline) {
          if (failure) throw failure;
          try {
            const results = await Promise.all([
              fetch(`${runtime.origin}/api/admin/stores`, { signal: AbortSignal.timeout(2000) }),
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
          setOnline: async (online) => {
            if (!online) {
              expectedStops.add(web);
              await new Promise<void>((done) => {
                const timer = setTimeout(() => web.kill("SIGKILL"), 5000);
                web.once("exit", () => {
                  clearTimeout(timer);
                  done();
                });
                web.kill("SIGTERM");
              });
              return;
            }
            web = startWeb();
            const end = Date.now() + 60_000;
            while (Date.now() < end) {
              if (failure) throw failure;
              try {
                if (
                  (
                    await fetch(`${runtime.origin}/api/admin/stores`, {
                      signal: AbortSignal.timeout(2000),
                    })
                  ).status === 401
                )
                  return;
              } catch {
                /* Worker起動中は接続を再試行する。 */
              }
              await new Promise((done) => setTimeout(done, 100));
            }
            throw new Error("Workerの再起動を確認できませんでした。");
          },
        });
        if (failure) throw failure;
      } finally {
        await Promise.all(
          children.toReversed().map(async (child) => {
            if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
            await new Promise<void>((done) => {
              const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
              child.once("exit", () => {
                clearTimeout(timer);
                done();
              });
              child.kill("SIGTERM");
            });
          }),
        );
        await execute("docker", ["rm", "--force", container], { timeout: 10000 }).catch(
          (error: Error) => {
            if (!error.message.includes(`No such container: ${container}`)) throw error;
          },
        );
        await rm(runtime.directory, { recursive: true, force: true });
      }
    },
    { timeout: 120_000 },
  ],
  baseURL: async ({ runtime }, use) => {
    await use(runtime.origin);
  },
});
