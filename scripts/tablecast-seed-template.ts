import { configurationErrors } from "@tablecast/api/bootstrap";
import { configurationSchema } from "@tablecast/api/schema";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { tablecastDemoIdentities } from "../apps/emulate/src/tablecast-demo-identities.ts";
import { demoStores } from "./tablecast-fixtures.ts";

const root = resolve(import.meta.dirname, "..");
const defaultPath = resolve(root, ".local/tablecast-seed-template/seed.json");
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const payloadSchema = z.strictObject({
  stores: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        name: z.string().min(1),
        tableCount: z.number().int().positive(),
        configuration: configurationSchema,
      }),
    )
    .min(1),
  staff: z
    .array(
      z.strictObject({
        email: z.email(),
        name: z.string().min(1),
        role: z.enum(tablecastDemoIdentities.map((person) => person.role)),
        stores: z.array(z.string().min(1)).min(1),
        imageFile: z.string().regex(/^[a-z0-9-]+\.webp$/),
      }),
    )
    .min(1),
});
const tablecastSeedTemplateSchema = z.strictObject({
  format: z.literal(1),
  sourceHash: digestSchema,
  payloadHash: digestSchema,
  payload: payloadSchema,
});

export type TablecastSeedTemplate = z.infer<typeof tablecastSeedTemplateSchema>;

function payloadHash(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function directoryFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await directoryFiles(path)));
    else if (entry.isFile()) files.push(path);
    else throw new Error(`seed入力に通常ファイル以外があります: ${path}`);
  }
  return files;
}

async function sourceHash() {
  // Turboのinputsもこの閉包に合わせる。生成物・env・絶対pathは含めない。
  const files = [
    "package.json",
    "bun.lock",
    "turbo.json",
    "apps/emulate/src/tablecast-demo-identities.ts",
  ];
  for (const directory of ["scripts", "apps/api/src", "apps/api/migrations", "assets/demo"])
    files.push(...(await directoryFiles(directory)));
  const hash = createHash("sha256");
  for (const path of files.sort()) {
    const bytes = await readFile(resolve(root, path));
    hash.update(`${new TextEncoder().encode(path).length}:${path}:${bytes.length}:`);
    hash.update(bytes);
  }
  return hash.digest("hex");
}

function validatePayload(payload: TablecastSeedTemplate["payload"]) {
  const stores = new Set(payload.stores.map((store) => store.id));
  const emails = new Set(payload.staff.map((person) => person.email));
  if (stores.size !== payload.stores.length || emails.size !== payload.staff.length)
    throw new Error("seedテンプレートの店舗またはスタッフが重複しています。");
  for (const store of payload.stores) {
    const errors = configurationErrors(store.configuration);
    if (errors.length) throw new Error(`seed構成が不正です: ${JSON.stringify(errors)}`);
  }
  if (payload.staff.some((person) => person.stores.some((store) => !stores.has(store))))
    throw new Error("seedテンプレートの所属店舗がありません。");
}

export async function createSeedTemplate(): Promise<TablecastSeedTemplate> {
  const payload = payloadSchema.parse({
    stores: demoStores("demo"),
    staff: tablecastDemoIdentities.map(({ email, name, role, stores, imageFile }) => ({
      email,
      name,
      role,
      stores: [...stores],
      imageFile,
    })),
  });
  validatePayload(payload);
  return { format: 1, sourceHash: await sourceHash(), payloadHash: payloadHash(payload), payload };
}

export async function readSeedTemplate(path = defaultPath): Promise<TablecastSeedTemplate> {
  const input = tablecastSeedTemplateSchema
    .extend({ payload: z.unknown() })
    .parse(JSON.parse(await readFile(path, "utf8")));
  const template = tablecastSeedTemplateSchema.parse(input);
  if (template.payloadHash !== payloadHash(input.payload))
    throw new Error("seedテンプレートの内容hashが一致しません。");
  if (template.sourceHash !== (await sourceHash()))
    throw new Error("seedテンプレートの入力hashが現在のソースと一致しません。");
  validatePayload(template.payload);
  return template;
}

export async function writeSeedTemplate(path = defaultPath): Promise<TablecastSeedTemplate> {
  const template = await createSeedTemplate();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(template)}\n`);
  return template;
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: { verify: { type: "boolean", default: false } },
    allowPositionals: false,
    strict: true,
  });
  if (values.verify) await readSeedTemplate();
  else await writeSeedTemplate();
}
