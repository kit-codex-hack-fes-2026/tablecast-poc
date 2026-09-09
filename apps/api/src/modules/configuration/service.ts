import { and, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import * as business from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import type { Actor } from "../auth/model";
import { requireManager } from "../auth/policy";
import { configurationErrors } from "../catalog/pricing";
import { getCatalog } from "../catalog/queries";
import { notifyStore } from "../tables/mutations";
import { voiceConfigurationErrors } from "../voice/catalog";
import {
  configurationIssueSchema,
  configurationSchema,
  type Catalog,
  type ConfigDraft,
  type Configuration,
} from "./model";
function hasSensitiveField(value: unknown, path: string): boolean {
  return (
    /price|allergen|vegan|crossContact|plans/.test(path) ||
    (value !== null &&
      typeof value === "object" &&
      Object.entries(value).some(([key, child]) => hasSensitiveField(child, key)))
  );
}
function differences(before: unknown, after: unknown, path = ""): ConfigDraft["changes"] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (
    before !== null &&
    after !== null &&
    typeof before === "object" &&
    typeof after === "object"
  ) {
    const left = Object.fromEntries(Object.entries(before));
    const right = Object.fromEntries(Object.entries(after));
    return [...new Set([...Object.keys(left), ...Object.keys(right)])].flatMap((key) =>
      differences(left[key] ?? null, right[key] ?? null, path ? `${path}.${key}` : key),
    );
  }
  return [
    {
      path,
      before: z.json().parse(before ?? null),
      after: z.json().parse(after ?? null),
      sensitive: hasSensitiveField(before, path) || hasSensitiveField(after, path),
    },
  ];
}
export async function getDraft(
  services: ApiServices,
  actor: Actor,
  id: string,
): Promise<ConfigDraft> {
  const db = services.db;

  const row = await db
    .select()
    .from(business.configDrafts)
    .where(and(eq(business.configDrafts.id, id), eq(business.configDrafts.store_id, actor.storeId)))
    .get();
  ensure(row, "DRAFT_NOT_FOUND", 404);
  const catalog = await getCatalog(services, actor.storeId);
  return draftValue(row, catalog);
}
function draftValue(row: typeof business.configDrafts.$inferSelect, catalog: Catalog): ConfigDraft {
  const configuration = configurationSchema.parse(JSON.parse(row.config_json));
  const storedErrors: unknown = JSON.parse(row.errors_json);
  const legacyErrors = z.array(z.string()).safeParse(storedErrors);
  // 旧形式は文言を解析せず保存設定から再評価する。読み取りでは検証状態・版を更新しない。
  const errors =
    legacyErrors.success && legacyErrors.data.length > 0
      ? configurationErrors(configuration)
      : z.array(configurationIssueSchema).parse(storedErrors);
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    storeId: row.store_id,
    baseVersion: row.base_version,
    version: row.version,
    status: row.status,
    configuration,
    errors,
    changes: differences(catalog.configuration, configuration),
  };
}
export async function listDrafts(services: ApiServices, actor: Actor) {
  const db = services.db;
  const [rows, catalog] = await Promise.all([
    db
      .select()
      .from(business.configDrafts)
      .where(
        and(
          eq(business.configDrafts.store_id, actor.storeId),
          ne(business.configDrafts.status, "discarded"),
        ),
      )
      .orderBy(desc(business.configDrafts.updated_at))
      .limit(30),
    getCatalog(services, actor.storeId),
  ]);
  return { drafts: rows.map((row) => draftValue(row, catalog)) };
}
export async function createDraft(services: ApiServices, actor: Actor) {
  const db = services.db;

  requireManager(actor);
  ensure(actor.userId, "LOGIN_REQUIRED", 401);
  const catalog = await getCatalog(services, actor.storeId);
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.insert(business.configDrafts).values({
    id: id,
    store_id: actor.storeId,
    base_version: catalog.version,
    status: "draft",
    config_json: JSON.stringify(catalog.configuration),
    created_by: actor.userId,
    created_at: now,
    updated_at: now,
  });
  return getDraft(services, actor, id);
}
export async function updateDraft(
  services: ApiServices,
  actor: Actor,
  id: string,
  input: { expectedVersion: number; configuration: Configuration },
) {
  const db = services.db;

  requireManager(actor);
  const configuration = configurationSchema.parse(input.configuration);
  const result = await db
    .update(business.configDrafts)
    .set({
      config_json: JSON.stringify(configuration),
      version: sql`version+1`,
      status: "draft",
      errors_json: "[]",
      updated_at: Date.now(),
    })
    .where(
      sql`id=${id} AND store_id=${actor.storeId} AND version=${input.expectedVersion} AND status IN ('draft','ready')`,
    );
  ensure(result.meta.changes === 1, "DRAFT_CONFLICT");
  return getDraft(services, actor, id);
}
export async function validateDraft(
  services: ApiServices,
  actor: Actor,
  id: string,
  expectedVersion: number,
) {
  const db = services.db;

  requireManager(actor);
  const draft = await getDraft(services, actor, id);
  ensure(draft.version === expectedVersion, "DRAFT_CONFLICT");
  const catalog = await getCatalog(services, actor.storeId);
  const errors = [
    ...configurationErrors(draft.configuration),
    ...(await voiceConfigurationErrors(services.env, draft.configuration, catalog.configuration)),
  ];
  const result = await db
    .update(business.configDrafts)
    .set({
      status: errors.length ? "draft" : "ready",
      errors_json: JSON.stringify(errors),
      updated_at: Date.now(),
    })
    .where(
      sql`id=${id} AND store_id=${actor.storeId} AND version=${expectedVersion} AND status IN ('draft','ready')`,
    );
  ensure(result.meta.changes === 1, "DRAFT_CONFLICT");
  return getDraft(services, actor, id);
}
export async function discardDraft(
  services: ApiServices,
  actor: Actor,
  id: string,
  expectedVersion: number,
) {
  const db = services.db;

  requireManager(actor);
  const result = await db
    .update(business.configDrafts)
    .set({ status: "discarded", updated_at: Date.now() })
    .where(
      sql`id=${id} AND store_id=${actor.storeId} AND version=${expectedVersion} AND status IN ('draft','ready')`,
    );
  ensure(result.meta.changes === 1, "DRAFT_CONFLICT");
  return getDraft(services, actor, id);
}
export async function publishDraft(
  services: ApiServices,
  actor: Actor,
  id: string,
  input: { expectedVersion: number; baseVersion: number; idempotencyKey: string; approved: true },
) {
  const db = services.db;

  requireManager(actor);
  ensure(actor.kind === "staff" && actor.userId, "HUMAN_APPROVAL_REQUIRED", 403);
  ensure(input.approved, "APPROVAL_REQUIRED", 422);
  const draft = await getDraft(services, actor, id);
  const now = Date.now();
  const previous = await db.get<{ id: string; version: number; base_version: number } | undefined>(
    sql`SELECT id,version,base_version FROM config_drafts WHERE store_id=${actor.storeId} AND publish_key=${input.idempotencyKey}`,
  );
  if (previous) {
    ensure(
      previous.id === id &&
        previous.version === input.expectedVersion &&
        previous.base_version === input.baseVersion,
      "IDEMPOTENCY_CONFLICT",
    );
    return draft;
  }
  ensure(draft.version === input.expectedVersion, "DRAFT_CONFLICT");
  ensure(
    draft.baseVersion === input.baseVersion && !configurationErrors(draft.configuration).length,
    "DRAFT_INVALID",
    422,
  );
  ensure(draft.status === "ready", "DRAFT_CONFLICT");
  const catalog = await getCatalog(services, actor.storeId);
  const voiceErrors = await voiceConfigurationErrors(
    services.env,
    draft.configuration,
    catalog.configuration,
  );
  ensure(!voiceErrors.length, "DRAFT_INVALID", 422, voiceErrors);
  const guard = sql`changes()=1 AND EXISTS(SELECT 1 FROM config_drafts WHERE id=${id} AND store_id=${actor.storeId} AND status='published' AND publish_key=${input.idempotencyKey})`;
  // 1件の更新を順に連鎖し、最初のCASが不成立なら後続も実行しない。
  const result = await db.batch([
    db
      .update(business.configDrafts)
      .set({
        status: "published",
        publish_key: input.idempotencyKey,
        updated_at: now,
      })
      .where(
        sql`id=${id} AND store_id=${actor.storeId} AND status='ready' AND version=${input.expectedVersion} AND base_version=${input.baseVersion} AND EXISTS(SELECT 1 FROM stores WHERE id=${actor.storeId} AND config_version=${input.baseVersion}) AND NOT EXISTS(SELECT 1 FROM config_drafts WHERE store_id=${actor.storeId} AND publish_key=${input.idempotencyKey})`,
      ),
    db
      .update(business.stores)
      .set({
        config_json: JSON.stringify(draft.configuration),
        config_version: sql`config_version+1`,
        updated_at: now,
      })
      .where(sql`id=${actor.storeId} AND config_version=${input.baseVersion} AND ${guard}`),
    db
      .insert(business.configReleases)
      .select(
        sql`SELECT id,config_version,config_json,${actor.userId},${now} FROM stores WHERE id=${actor.storeId} AND ${guard}`,
      ),
    db
      .insert(business.tableEvents)
      .select(
        sql`SELECT NULL,id,NULL,'configuration.published',${JSON.stringify({ version: input.baseVersion + 1, draftId: id, actorId: actor.userId })},${now} FROM stores WHERE id=${actor.storeId} AND ${guard}`,
      ),
    // 失効する確認は0件以上なので、1件連鎖の最後に置く。
    db
      .update(business.confirmations)
      .set({ status: "invalid" })
      .where(sql`store_id=${actor.storeId} AND status IN ('pending','read') AND ${guard}`),
  ]);
  if (result[0]?.meta.changes !== 1) {
    const retry = await db.get<{ id: string; version: number; base_version: number } | undefined>(
      sql`SELECT id,version,base_version FROM config_drafts WHERE store_id=${actor.storeId} AND publish_key=${input.idempotencyKey}`,
    );
    ensure(retry, "DRAFT_CONFLICT");
    ensure(
      retry.id === id &&
        retry.version === input.expectedVersion &&
        retry.base_version === input.baseVersion,
      "IDEMPOTENCY_CONFLICT",
    );
    return getDraft(services, actor, id);
  }
  await notifyStore(services, actor.storeId);
  return getDraft(services, actor, id);
}
