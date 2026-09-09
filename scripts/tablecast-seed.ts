import process from "node:process";
import { randomUUID } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getPlatformProxy } from "wrangler";
import { z } from "zod";
import { seedDemoDatabase } from "./tablecast-seed-data";
export { sampleLine } from "./tablecast-seed-data";
import { readRuntime, tablecastLocal, tablecastRoot } from "./tablecast-runtime";

const demoSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  otherEmail: z.string().email(),
  otherPassword: z.string().min(12),
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
      email: "owner@tablecast.example",
      password: randomUUID().replaceAll("-", ""),
      otherEmail: "koharu@tablecast.example",
      otherPassword: randomUUID().replaceAll("-", ""),
      baseTime: Date.now(),
      profile,
    };
    await writeFile(path, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
    return data;
  }
}

async function seed() {
  const args = z
    .array(z.string())
    .parse(process.argv)
    .slice(2)
    .filter((arg) => arg !== "--");
  if (args.some((arg) => !["--profile", "smoke", "demo", "history"].includes(arg)))
    throw new Error("seedはlocal専用です。指定可能な引数は --profile smoke|demo|history です。");
  const profileOption = args.indexOf("--profile");
  const requestedProfile =
    profileOption < 0
      ? undefined
      : z.enum(["smoke", "demo", "history"]).parse(args[profileOption + 1]);
  const runtime = await readRuntime();
  const credentials = await demoCredentials(requestedProfile);
  const profile = requestedProfile ?? credentials.profile;
  if (credentials.profile !== profile)
    throw new Error("プロファイルを変更する前に bun run demo:reset を実行してください。");
  const generated = z
    .object({
      compatibility_date: z.string(),
      compatibility_flags: z.array(z.string()),
      vars: z.record(z.string(), z.unknown()),
      d1_databases: z
        .array(
          z.object({
            binding: z.literal("TABLECAST_DB"),
            database_name: z.string(),
            database_id: z.string(),
            migrations_dir: z.string(),
          }),
        )
        .length(1),
      r2_buckets: z
        .array(z.object({ binding: z.literal("TABLECAST_MEDIA"), bucket_name: z.string() }))
        .length(1),
    })
    .parse(JSON.parse(await readFile(runtime.apiConfig, "utf8")));
  const seedConfig = join(tablecastLocal, "seed.wrangler.json");
  await writeFile(
    seedConfig,
    JSON.stringify({ name: `tablecast-${runtime.id}-seed`, ...generated }, null, 2) + "\n",
  );
  const platform = await getPlatformProxy<TablecastEnv>({
    configPath: seedConfig,
    envFiles: [".dev.vars"],
    persist: { path: join(runtime.state, "v3") },
    remoteBindings: false,
  });
  try {
    const env = platform.env;
    if (env.TABLECAST_ENV !== "development" || env.TABLECAST_PUBLIC_ORIGIN !== runtime.origin)
      throw new Error("seed対象がこのworktreeの開発環境ではありません。");
    const counts = await seedDemoDatabase(env, credentials);
    const directory = join(tablecastRoot, "assets", "demo");
    for (const file of (await readdir(directory))
      .filter((name) => /^[a-z0-9-]+\.png$/.test(name))
      .sort()) {
      await env.TABLECAST_MEDIA.put(
        `tablecast/demo/${file}`,
        await readFile(join(directory, file)),
        {
          httpMetadata: { contentType: "image/png", cacheControl: "public,max-age=86400" },
          customMetadata: { source: "synthetic-demo" },
        },
      );
    }
    console.info(
      JSON.stringify(
        {
          profile,
          counts,
          credentialsFile: join(tablecastLocal, "demo.json"),
          origin: runtime.origin,
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
