import { z } from "zod";
import { createAuth, type AuthEnv } from "./auth";
import { DomainError, ensure } from "./errors";
import { configurationErrors } from "./modules/pricing";
import { configurationSchema, localeSchema } from "./schema";

const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const name = z.string().trim().min(1).max(150);

export const bootstrapInputSchema = z
  .strictObject({
    admin: z.strictObject({
      name,
      email: z
        .email()
        .max(254)
        .transform((value) => value.toLowerCase()),
      password: z.string().min(12).max(128),
      locale: localeSchema,
    }),
    organization: z.strictObject({
      name,
      slug: z
        .string()
        .min(1)
        .max(100)
        .regex(/^[a-z0-9-]+$/),
    }),
    store: z.strictObject({ id, name, configuration: configurationSchema }),
    tables: z.array(z.strictObject({ id, name })).min(1).max(100),
  })
  .superRefine((input, ctx) => {
    for (const issue of configurationErrors(input.store.configuration))
      ctx.addIssue({
        code: "custom",
        path: ["store", "configuration", ...issue.path],
        message: issue.code,
      });
    for (const locale of localeSchema.options)
      if (input.store.configuration.cast.voice[locale] !== null)
        ctx.addIssue({
          code: "custom",
          path: ["store", "configuration", "cast", "voice", locale],
          message: "初期音声は未設定にしてください。",
        });
    const ids = new Set<string>();
    for (const [index, table] of input.tables.entries()) {
      if (ids.has(table.id))
        ctx.addIssue({
          code: "custom",
          path: ["tables", index, "id"],
          message: "卓IDが重複しています。",
        });
      ids.add(table.id);
    }
  });

export type BootstrapInput = z.infer<typeof bootstrapInputSchema>;
export type BootstrapEnv = AuthEnv & Pick<TablecastEnv, "TABLECAST_ENV">;
export type BootstrapResult = {
  userId: string;
  organizationId: string;
  storeId: string;
  tableIds: string[];
  configVersion: 1;
};

// 管理CLI専用。既存資源の採用・更新や途中失敗からの自動再開は行わない。
export async function bootstrapDatabase(
  env: BootstrapEnv,
  rawInput: unknown,
): Promise<BootstrapResult> {
  ensure(["staging", "production"].includes(env.TABLECAST_ENV), "BOOTSTRAP_ENV_INVALID", 422);
  const parsed = bootstrapInputSchema.safeParse(rawInput);
  ensure(parsed.success, "BOOTSTRAP_INVALID", 422);
  const input = parsed.data;
  const db = env.TABLECAST_DB;
  const progress: {
    stage: "preflight" | "administrator" | "organization" | "store";
    userId: string | null;
    organizationId: string | null;
  } = { stage: "preflight", userId: null, organizationId: null };
  try {
    const conflict = await db
      .prepare(
        "SELECT 1 FROM user WHERE lower(email)=? UNION ALL SELECT 1 FROM organization WHERE slug=? UNION ALL SELECT 1 FROM stores WHERE id=? UNION ALL SELECT 1 FROM restaurant_tables WHERE id IN (SELECT value FROM json_each(?)) LIMIT 1",
      )
      .bind(
        input.admin.email,
        input.organization.slug,
        input.store.id,
        JSON.stringify(input.tables.map((table) => table.id)),
      )
      .first();
    ensure(!conflict, "BOOTSTRAP_CONFLICT", 409, progress);

    // 認証API間は同一トランザクションにできないため、例外には判明したIDだけを残す。
    progress.stage = "administrator";
    const auth = createAuth(env, { disabled: true });
    const { user } = await auth.api.signUpEmail({ body: input.admin });
    progress.userId = user.id;
    progress.stage = "organization";
    const organization = await auth.api.createOrganization({
      body: { ...input.organization, userId: user.id },
    });
    ensure(organization, "BOOTSTRAP_FAILED", 503);
    progress.organizationId = organization.id;
    progress.stage = "store";
    const now = Date.now();
    const configJson = JSON.stringify(input.store.configuration);
    await db.batch([
      db
        .prepare(
          "INSERT INTO stores(id,organization_id,name,config_json,updated_at) VALUES(?,?,?,?,?)",
        )
        .bind(input.store.id, organization.id, input.store.name, configJson, now),
      db
        .prepare(
          "INSERT INTO config_releases(store_id,version,config_json,published_by,created_at) VALUES(?,1,?,?,?)",
        )
        .bind(input.store.id, configJson, user.id, now),
      ...input.tables.map((table) =>
        db
          .prepare("INSERT INTO restaurant_tables(id,store_id,name) VALUES(?,?,?)")
          .bind(table.id, input.store.id, table.name),
      ),
    ]);
    return {
      userId: user.id,
      organizationId: organization.id,
      storeId: input.store.id,
      tableIds: input.tables.map((table) => table.id),
      configVersion: 1,
    };
  } catch (error) {
    if (error instanceof DomainError && error.code === "BOOTSTRAP_CONFLICT") throw error;
    throw new DomainError("BOOTSTRAP_FAILED", 503, "BOOTSTRAP_FAILED", progress);
  }
}
