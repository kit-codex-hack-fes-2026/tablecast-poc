import { constants } from "node:fs";
import { mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { parse, type ParseError } from "jsonc-parser";
import { z } from "zod";
import { bootstrapDatabase, bootstrapInputSchema } from "../apps/api/src/bootstrap";
import { DomainError } from "../apps/api/src/errors";

const environmentSchema = z.enum(["staging", "production"]);
const originSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value;
  });
const databaseSchema = z.object({
  binding: z.literal("TABLECAST_DB"),
  database_name: z.string().regex(/^tablecast[a-z0-9-]*$/),
  database_id: z.uuid().refine((value) => value !== "00000000-0000-0000-0000-000000000000"),
});
const configSchema = z.object({
  account_id: z.string().regex(/^[a-f0-9]{32}$/),
  compatibility_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  compatibility_flags: z.array(z.string()).refine((flags) => flags.includes("nodejs_compat")),
  env: z.record(z.string(), z.unknown()),
});
const environmentConfigSchema = z.object({
  name: z.string().regex(/^tablecast[a-z0-9-]*$/),
  account_id: z
    .string()
    .regex(/^[a-f0-9]{32}$/)
    .optional(),
  compatibility_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  compatibility_flags: z.array(z.string()).optional(),
  vars: z.object({ TABLECAST_ENV: environmentSchema, TABLECAST_PUBLIC_ORIGIN: originSchema }),
  d1_databases: z.array(databaseSchema).length(1),
});

export function bootstrapOptions(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      config: { type: "string" },
      env: { type: "string" },
      input: { type: "string" },
      apply: { type: "boolean", default: false },
      remote: { type: "boolean", default: false },
      local: { type: "boolean", default: false },
      "persist-to": { type: "string" },
    },
    allowPositionals: false,
    strict: true,
  });
  if (!values.config || !values.input || values.local === values.remote)
    throw new Error("config・env・inputとlocalまたはremoteの一方を指定してください。");
  if (values.local !== Boolean(values["persist-to"]))
    throw new Error("local検証では専用のpersist-toを指定してください。");
  return {
    config: resolve(values.config),
    environment: environmentSchema.parse(values.env),
    input: resolve(values.input),
    apply: values.apply,
    remote: values.remote,
    persist: values["persist-to"] ? resolve(values["persist-to"]) : undefined,
  };
}

export function bootstrapTarget(text: string, environment: "staging" | "production") {
  const errors: ParseError[] = [];
  const parsed: unknown = parse(text, errors, { allowTrailingComma: true });
  if (errors.length) throw new Error("Wrangler設定のJSONが不正です。");
  const config = configSchema.parse(parsed);
  const selected = environmentConfigSchema.parse(config.env[environment]);
  if (selected.vars.TABLECAST_ENV !== environment)
    throw new Error("指定環境とTABLECAST_ENVが一致しません。");
  const [database] = selected.d1_databases;
  if (!database) throw new Error("対象DBがありません。");
  const flags = selected.compatibility_flags ?? config.compatibility_flags;
  if (!flags.includes("nodejs_compat")) throw new Error("nodejs_compatが必要です。");
  return {
    accountId: selected.account_id ?? config.account_id,
    worker: selected.name,
    environment,
    origin: selected.vars.TABLECAST_PUBLIC_ORIGIN,
    database,
    compatibilityDate: selected.compatibility_date ?? config.compatibility_date,
    compatibilityFlags: flags,
  };
}

export async function readBootstrapInput(path: string) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.size > 1_048_576)
      throw new Error("入力は所有者だけが読める1MiB以下の通常ファイルにしてください。");
    const input: unknown = JSON.parse(await file.readFile("utf8"));
    return bootstrapInputSchema
      .safeExtend({ authSecret: z.string().min(32).max(1024) })
      .parse(input);
  } finally {
    await file.close();
  }
}

async function main() {
  const options = bootstrapOptions(process.argv.slice(2));
  const target = bootstrapTarget(await readFile(options.config, "utf8"), options.environment);
  const { authSecret, ...input } = await readBootstrapInput(options.input);
  console.info(
    JSON.stringify(
      {
        mode: options.remote ? "remote" : "local",
        apply: options.apply,
        accountId: target.accountId,
        worker: target.worker,
        environment: target.environment,
        origin: target.origin,
        database: target.database,
        persist: options.persist,
        storeId: input.store.id,
        tableCount: input.tables.length,
      },
      null,
      2,
    ),
  );
  if (!options.apply) return;

  const directory = await mkdtemp(join(tmpdir(), "tablecast-bootstrap-"));
  try {
    // 対象D1だけを渡し、開発用のbinding・dotenv・秘密情報を混入させない。
    const configPath = join(directory, "wrangler.json");
    await writeFile(
      configPath,
      JSON.stringify({
        name: `tablecast-bootstrap-${target.environment}`,
        account_id: target.accountId,
        compatibility_date: target.compatibilityDate,
        compatibility_flags: target.compatibilityFlags,
        d1_databases: [{ ...target.database, remote: options.remote }],
      }),
    );
    await writeFile(join(directory, "tablecast-empty.env"), "");
    const { getPlatformProxy } = await import("wrangler");
    const platform = await getPlatformProxy<Pick<TablecastEnv, "TABLECAST_DB">>({
      configPath,
      envFiles: ["tablecast-empty.env"],
      persist: options.persist ? { path: join(options.persist, "v3") } : false,
      remoteBindings: options.remote,
    });
    try {
      const result = await bootstrapDatabase(
        {
          TABLECAST_DB: platform.env.TABLECAST_DB,
          TABLECAST_AUTH_SECRET: authSecret,
          TABLECAST_PUBLIC_ORIGIN: target.origin,
          TABLECAST_ENV: target.environment,
        },
        input,
      );
      console.info(JSON.stringify(result, null, 2));
    } finally {
      await platform.dispose();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (import.meta.main)
  await main().catch((error: unknown) => {
    // 認証やDBの例外には入力・資格が含まれ得るため、そのまま表示しない。
    if (
      error instanceof DomainError &&
      ["BOOTSTRAP_CONFLICT", "BOOTSTRAP_FAILED"].includes(error.code)
    ) {
      const details = z
        .object({
          stage: z.enum(["preflight", "administrator", "organization", "store"]),
          userId: z.string().nullable(),
          organizationId: z.string().nullable(),
        })
        .safeParse(error.details);
      console.error(JSON.stringify({ code: error.code, ...(details.success ? details.data : {}) }));
    }
    console.error("初期設定に失敗しました。入力・対象設定・DBの整合性を確認してください。");
    process.exitCode = 1;
  });
