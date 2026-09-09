import { execFile, spawn, type ChildProcess } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { getPlatformProxy } from "wrangler";
import { z } from "zod";
import { seedDemoDatabase } from "../../../../scripts/tablecast-seed-data";
import { credentials, runtime } from "./runtime";
const execute = promisify(execFile);
const root = resolve(import.meta.dirname, "../../../..");
export default async function setup() {
  const parentEnv = z.record(z.string(), z.string().optional()).parse({ ...process.env });
  const children: ChildProcess[] = [];
  let failure: Error | undefined;
  const container = `tablecast-e2e-mailpit-${runtime.ports.mailpit}`;
  const start = (command: string, args: string[], env: Partial<NodeJS.ProcessEnv> = {}) => {
    const child = spawn(command, args, {
      cwd: command === "node" ? join(root, "apps/web") : root,
      env: { ...parentEnv, ...env },
      stdio: "inherit",
    });
    child.once("error", (error) => {
      failure = error;
    });
    child.once("exit", (code, signal) => {
      failure ??= new Error(`${command}が起動中に終了しました: ${code ?? signal}`);
    });
    children.push(child);
    return child;
  };
  const stop = async () => {
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
    // Docker CLIの終了だけではcontainerの終了を保証しない。
    await execute("docker", ["rm", "--force", container], { timeout: 10000 }).catch(
      (error: Error) => {
        if (!error.message.includes(`No such container: ${container}`)) throw error;
      },
    );
    const evidence = join(root, "apps/web/test-results/tablecast-runtime");
    await mkdir(evidence, { recursive: true });
    await copyFile(
      join(runtime.directory, "migrations.log"),
      join(evidence, "migrations.log"),
    ).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    await rm(runtime.directory, { recursive: true, force: true });
  };
  try {
    const apiConfig = join(runtime.directory, "api.wrangler.json"),
      webConfig = join(runtime.directory, "web.wrangler.json"),
      state = join(runtime.directory, "state");
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
    const d1 = [
      {
        binding: "TABLECAST_DB",
        database_name: "tablecast-e2e",
        database_id: "00000000-0000-0000-0000-000000000002",
        migrations_dir: join(root, "apps/api/migrations"),
      },
    ];
    const r2 = [{ binding: "TABLECAST_MEDIA", bucket_name: "tablecast-e2e-media" }];
    const base = {
      compatibility_date: "2026-09-03",
      compatibility_flags: ["nodejs_compat", "nodejs_compat_do_not_populate_process_env"],
    };
    await writeFile(
      apiConfig,
      JSON.stringify({
        ...base,
        name: "tablecast-api",
        main: join(root, "apps/api/src/worker.ts"),
        vars,
        d1_databases: d1,
        r2_buckets: r2,
        images: { binding: "TABLECAST_IMAGES" },
        durable_objects: { bindings: [{ name: "TABLECAST_EVENTS", class_name: "StoreEvents" }] },
        migrations: [{ tag: "tablecast-v1", new_sqlite_classes: ["StoreEvents"] }],
      }),
    );
    await writeFile(
      webConfig,
      JSON.stringify({
        ...base,
        name: "tablecast-web",
        main: join(root, "apps/web/src/server.ts"),
        services: [{ binding: "TABLECAST_API", service: "tablecast-api" }],
      }),
    );
    const seedConfig = join(runtime.directory, "seed.wrangler.json");
    await writeFile(
      seedConfig,
      JSON.stringify({
        ...base,
        name: "tablecast-e2e-seed",
        vars,
        d1_databases: d1,
        r2_buckets: r2,
      }),
    );
    await execute(
      "node",
      [
        join(root, "node_modules/wrangler/bin/wrangler.js"),
        "d1",
        "migrations",
        "apply",
        "TABLECAST_DB",
        "--local",
        "--config",
        seedConfig,
        "--persist-to",
        state,
      ],
      {
        cwd: root,
        env: {
          ...parentEnv,
          CI: "true",
          WRANGLER_LOG_PATH: join(runtime.directory, "migrations.log"),
        },
      },
    );
    const platform = await getPlatformProxy<TablecastEnv>({
      configPath: seedConfig,
      envFiles: [],
      persist: { path: join(state, "v3") },
      remoteBindings: false,
    });
    try {
      await seedDemoDatabase(platform.env, credentials);
      for (const file of await readdir(join(root, "assets/demo"))) {
        if (!file.endsWith(".png")) continue;
        await platform.env.TABLECAST_MEDIA.put(
          `tablecast/demo/${file}`,
          await readFile(join(root, "assets/demo", file)),
          { httpMetadata: { contentType: "image/png" } },
        );
      }
    } finally {
      await platform.dispose();
    }
    const webEnv = {
      ...parentEnv,
      TABLECAST_LOCAL_BUILD: "1",
      TABLECAST_VITE_CACHE_DIR: join(runtime.directory, "vite"),
      TABLECAST_WEB_CONFIG: webConfig,
      TABLECAST_API_CONFIG: apiConfig,
      TABLECAST_STATE_PATH: state,
      TABLECAST_INSPECTOR_PORT: String(runtime.ports.inspector),
      TABLECAST_PUBLIC_ORIGIN: runtime.origin,
    };
    const vite = join(root, "apps/web/node_modules/.bin/vite");
    await execute("node", [vite, "build"], {
      cwd: join(root, "apps/web"),
      env: webEnv,
      maxBuffer: 5 * 1024 * 1024,
    });
    start("bun", ["--no-env-file", "apps/emulate/src/index.ts"], {
      TABLECAST_PUBLIC_ORIGIN: runtime.origin,
      TABLECAST_OAUTH_PORT: String(runtime.ports.oauth),
    });
    start("docker", [
      "run",
      "--rm",
      "--name",
      container,
      "-p",
      `127.0.0.1:${runtime.ports.mailpit}:8025`,
      "axllent/mailpit:v1.29.2",
    ]);
    start(
      "node",
      [
        vite,
        "preview",
        "--host",
        "127.0.0.1",
        "--port",
        String(runtime.ports.web),
        "--strictPort",
        "--logLevel",
        "warn",
      ],
      {
        ...webEnv,
      },
    );
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      if (failure) throw failure;
      try {
        const results = await Promise.all([
          fetch(`${runtime.origin}/api/admin/stores`, { signal: AbortSignal.timeout(2000) }),
          fetch(`${vars.TABLECAST_MAILPIT_URL}/api/v1/info`, { signal: AbortSignal.timeout(2000) }),
          fetch(`${vars.TABLECAST_GOOGLE_EMULATOR_URL}/.well-known/openid-configuration`, {
            signal: AbortSignal.timeout(2000),
          }),
        ]);
        if (results[0]?.status === 401 && results[1]?.ok && results[2]?.ok) return stop;
      } catch {}
      await new Promise((done) => setTimeout(done, 500));
    }
    throw new Error("隔離した受入試験環境を起動できませんでした。");
  } catch (error) {
    await stop();
    throw error;
  }
}
