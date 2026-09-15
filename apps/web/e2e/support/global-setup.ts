import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { getPlatformProxy } from "wrangler";
import { z } from "zod";
import { seedDemoDatabase } from "../../../../scripts/tablecast-seed-data";
import { diagnosticSecrets, redactCredentials } from "../../../api/src/platform/diagnostics";
import { credentials, runtime } from "./runtime";
const execute = promisify(execFile);
const root = resolve(import.meta.dirname, "../../../..");
export default async function setup() {
  const parentEnv = z.record(z.string(), z.string().optional()).parse({ ...process.env });
  const stop = async () => {
    const errors: unknown[] = [];
    try {
      const log = await readFile(join(runtime.directory, "migrations.log"), "utf8");
      const evidence = join(
        root,
        "apps/web/test-results/tablecast-runtime",
        basename(runtime.directory),
      );
      await mkdir(evidence, { recursive: true });
      await writeFile(
        join(evidence, "migrations.log"),
        redactCredentials(log, diagnosticSecrets(parentEnv)).slice(-65_536),
        { mode: 0o600 },
      );
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
        errors.push(error);
    }
    try {
      await rm(runtime.directory, { recursive: true, force: true });
    } catch (error) {
      errors.push(error);
    }
    if (errors.length) throw new AggregateError(errors, "E2E templateの後片付けに失敗しました。");
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
      TABLECAST_GOOGLE_EMULATOR_URL: `${runtime.origin}/_tablecast/oauth`,
      TABLECAST_GOOGLE_AUTHORIZE_URL: `${runtime.origin}/_tablecast/oauth`,
      TABLECAST_MAILPIT_URL: `${runtime.origin}/_tablecast/mailpit`,
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
    } finally {
      await platform.dispose();
    }
    const webEnv = {
      ...parentEnv,
      WRANGLER_REGISTRY_PATH: join(runtime.directory, "registry"),
      TABLECAST_LOCAL_BUILD: "1",
      TABLECAST_BUILD_DIRECTORY: join(runtime.directory, "build"),
      TABLECAST_VITE_CACHE_DIR: join(runtime.directory, "vite"),
      TABLECAST_WEB_CONFIG: webConfig,
      TABLECAST_API_CONFIG: apiConfig,
      TABLECAST_STATE_PATH: state,
      TABLECAST_PUBLIC_ORIGIN: runtime.origin,
    };
    const vite = join(root, "apps/web/node_modules/.bin/vite");
    await execute("node", [vite, "build"], {
      cwd: join(root, "apps/web"),
      env: webEnv,
      maxBuffer: 5 * 1024 * 1024,
    });
    await execute("docker", ["pull", "axllent/mailpit:v1.29.2"]);
    // CI/ローカルともDocker imageからMailpitバイナリを抽出し、ケースごとのcontainer起動を避ける。
    const extract = `tablecast-mailpit-extract-${basename(runtime.directory)}`;
    await execute("docker", ["rm", "--force", extract]).catch(() => undefined);
    await execute("docker", ["create", "--name", extract, "axllent/mailpit:v1.29.2"]);
    try {
      await execute("docker", [
        "cp",
        `${extract}:/mailpit`,
        join(runtime.directory, "mailpit"),
      ]);
      await execute("chmod", ["755", join(runtime.directory, "mailpit")]);
    } finally {
      await execute("docker", ["rm", "--force", extract]).catch(() => undefined);
    }
    return stop;
  } catch (error) {
    try {
      await stop();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "E2E templateの準備と後片付けに失敗しました。",
        { cause: cleanupError },
      );
    }
    throw error;
  }
}
