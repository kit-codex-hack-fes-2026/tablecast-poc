import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { getPlatformProxy } from "wrangler";
import { z } from "zod";
import { buildTablecast } from "../../../../scripts/tablecast-build";
import { seedDemoDatabase } from "../../../../scripts/tablecast-seed-data";
import { seedE2ePolicyPasskeys } from "../../../../scripts/test-support/tablecast-auth-fixture";
import { apiSdkConfiguration } from "../../../api/cloudflare.config";
import { diagnosticSecrets, redactCredentials } from "../../../api/src/platform/diagnostics";
import { credentials, runtime } from "./runtime";
const execute = promisify(execFile);
const root = resolve(import.meta.dirname, "../../../..");
export default async function setup() {
  const parentEnv = z
    .object({
      env: z.preprocess(
        (value) => (typeof value === "object" && value !== null ? { ...value } : value),
        z.record(z.string(), z.string().optional()),
      ),
    })
    .parse(process).env;
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
    const state = join(runtime.directory, "state");
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
    const options = {
      api: {
        name: "tablecast-api",
        vars,
        database: { name: "tablecast-e2e", id: "00000000-0000-4000-8000-000000000002" },
        bucket: "tablecast-e2e-media",
      },
      web: { name: "tablecast-web", api: "tablecast-api" },
    };
    const seedConfig = join(runtime.directory, "seed.wrangler.json");
    await writeFile(
      seedConfig,
      JSON.stringify(apiSdkConfiguration({ ...options.api, name: "tablecast-e2e-seed" })),
    );
    const migrations = execute(
      "node",
      [
        join(root, "scripts/tablecast-cf-local.ts"),
        "d1",
        "migrations",
        "apply",
        "00000000-0000-4000-8000-000000000002",
        "--dir",
        join(root, "apps/api/migrations"),
        "--local",
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
    migrations.child.stdin?.end();
    await migrations;
    const platform = await getPlatformProxy<TablecastEnv>({
      configPath: seedConfig,
      envFiles: [],
      persist: { path: join(state, "v3") },
      remoteBindings: false,
    });
    try {
      await seedDemoDatabase(platform.env, credentials);
      await seedE2ePolicyPasskeys(platform.env.TABLECAST_DB);
    } finally {
      await platform.dispose();
    }
    const webEnv = {
      ...parentEnv,
      WRANGLER_REGISTRY_PATH: join(runtime.directory, "registry"),
      TABLECAST_LOCAL_BUILD: "1",
      TABLECAST_BUILD_DIRECTORY: join(runtime.directory, "build"),
      TABLECAST_VITE_CACHE_DIR: join(runtime.directory, "vite"),
      TABLECAST_CONFIG: JSON.stringify(options),
      TABLECAST_STATE_PATH: state,
      TABLECAST_PUBLIC_ORIGIN: runtime.origin,
    };
    await buildTablecast(webEnv);
    // CI/ローカルともDocker imageからMailpitバイナリを抽出し、ケースごとのcontainer起動を避ける。
    const extract = `tablecast-mailpit-extract-${basename(runtime.directory)}`;
    await execute("docker", ["rm", "--force", extract]).catch(() => undefined);
    await execute("docker", [
      "create",
      "--pull=missing",
      "--name",
      extract,
      "axllent/mailpit:v1.31.6",
    ]);
    try {
      await execute("docker", ["cp", `${extract}:/mailpit`, join(runtime.directory, "mailpit")]);
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
