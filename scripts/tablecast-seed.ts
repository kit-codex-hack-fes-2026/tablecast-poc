import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { getPlatformProxy } from "wrangler";
import { z } from "zod";
import { tablecastDemoEmail } from "../apps/emulate/src/tablecast-demo-identities.ts";
import {
  assertPrepared,
  portAvailable,
  tablecastLocal,
  tablecastRoot,
} from "./tablecast-runtime.ts";
import { seedDemoDatabase } from "./tablecast-seed-data.ts";
export { sampleLine } from "./tablecast-seed-data.ts";

const demoSchema = z.object({
  email: z.string().email(),
  otherEmail: z.string().email(),
  baseTime: z.number().int(),
  profile: z.enum(["smoke", "demo", "history"]),
});
export type DemoCredentials = z.infer<typeof demoSchema>;

export async function demoCredentials(profile: DemoCredentials["profile"] = "demo") {
  const path = join(tablecastLocal, "demo.json");
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    return demoSchema.parse(value);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    const data: DemoCredentials = {
      email: "haruka.sato@komorebi-shijo.com",
      otherEmail: "tsubasa.yamamoto@westward-burgers-kyoto.com",
      baseTime: Date.now(),
      profile,
    };
    await writeFile(path, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
    return data;
  }
}

async function seed() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg: string) => arg !== "--"),
    options: { reset: { type: "boolean" }, profile: { type: "string" } },
  });
  const requestedProfile = demoSchema.shape.profile.optional().parse(values.profile);
  await assertPrepared();
  const state = join(tablecastLocal, "state");
  const origin = process.env.TABLECAST_PUBLIC_ORIGIN;
  const previousCredentials = await demoCredentials(requestedProfile);
  const credentials = {
    ...previousCredentials,
    email: tablecastDemoEmail(previousCredentials.email),
    otherEmail: tablecastDemoEmail(previousCredentials.otherEmail),
  };
  const profile = requestedProfile ?? credentials.profile;
  if (values.reset) {
    if (!(await portAvailable(Number(process.env.TABLECAST_WEB_PORT ?? 0))))
      throw new Error("開発サーバーをCtrl+Cで停止してからリセットしてください。");
    await rm(state, { recursive: true, force: true });
    credentials.email = "haruka.sato@komorebi-shijo.com";
    credentials.otherEmail = "tsubasa.yamamoto@westward-burgers-kyoto.com";
    credentials.profile = profile;
    credentials.baseTime = Date.now();
    await writeFile(
      join(tablecastLocal, "demo.json"),
      JSON.stringify(credentials, null, 2) + "\n",
      { mode: 0o600 },
    );
    const migration = Bun.spawn(["bun", "run", "db:migrate"], {
      cwd: tablecastRoot,
      stdout: "inherit",
      stderr: "inherit",
    });
    if ((await migration.exited) !== 0) throw new Error("リセット後のmigrationに失敗しました。");
  }
  if (credentials.profile !== profile)
    throw new Error("プロファイルを変更する前に bun run demo:reset を実行してください。");
  const generated = z
    .record(z.string(), z.unknown())
    .parse(JSON.parse(await readFile(join(tablecastLocal, "api.wrangler.json"), "utf8")));
  const seedConfig = join(tablecastLocal, "seed.wrangler.json");
  await writeFile(
    seedConfig,
    JSON.stringify(
      {
        name: `tablecast-${process.env.TABLECAST_RESOURCE_NAME}-seed`,
        ...Object.fromEntries(
          [
            "compatibility_date",
            "compatibility_flags",
            "vars",
            "d1_databases",
            "r2_buckets",
            "images",
          ].map((key) => [key, generated[key]]),
        ),
      },
      null,
      2,
    ) + "\n",
  );
  const platform = await getPlatformProxy<TablecastEnv>({
    configPath: seedConfig,
    envFiles: [".dev.vars"],
    persist: { path: join(state, "v3") },
    remoteBindings: false,
  });
  try {
    const env = platform.env;
    if (env.TABLECAST_ENV !== "development" || env.TABLECAST_PUBLIC_ORIGIN !== origin)
      throw new Error("seed対象がこのworktreeの開発環境ではありません。");
    const counts = await seedDemoDatabase(env, credentials);
    if (
      credentials.email !== previousCredentials.email ||
      credentials.otherEmail !== previousCredentials.otherEmail
    )
      await writeFile(
        join(tablecastLocal, "demo.json"),
        JSON.stringify(credentials, null, 2) + "\n",
        { mode: 0o600 },
      );
    console.info(
      JSON.stringify(
        {
          profile,
          counts,
          credentialsFile: join(tablecastLocal, "demo.json"),
          origin,
        },
        null,
        2,
      ),
    );
  } finally {
    await platform.dispose();
  }
}

if (import.meta.main)
  await seed().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "ローカルseedに失敗しました。");
    process.exitCode = 1;
  });
