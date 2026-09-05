import { z } from "zod";
import type { Actor } from "../auth";
import { requireManager } from "../auth";
import { ensure } from "../errors";
import { configurationSchema, type ConfigDraft, type Configuration } from "../schema";
import { getCatalog, notifyStore } from "./operations";
import { configurationErrors } from "./pricing";

type DraftRecord = {
  id: string;
  store_id: string;
  base_version: number;
  version: number;
  status: ConfigDraft["status"];
  config_json: string;
  errors_json: string;
  publish_key: string | null;
};
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
      before: before ?? null,
      after: after ?? null,
      sensitive: /price|allergen|vegan|crossContact|plans/.test(path),
    },
  ];
}
export async function getDraft(env: TablecastEnv, actor: Actor, id: string): Promise<ConfigDraft> {
  const row = await env.TABLECAST_DB.prepare(
    "SELECT * FROM config_drafts WHERE id=? AND store_id=?",
  )
    .bind(id, actor.storeId)
    .first<DraftRecord>();
  ensure(row, "DRAFT_NOT_FOUND", 404);
  const catalog = await getCatalog(env, actor.storeId);
  const configuration = configurationSchema.parse(JSON.parse(row.config_json));
  return {
    id: row.id,
    storeId: row.store_id,
    baseVersion: row.base_version,
    version: row.version,
    status: row.status,
    configuration,
    errors: z.array(z.string()).parse(JSON.parse(row.errors_json)),
    changes: differences(catalog.configuration, configuration),
  };
}
export async function listDrafts(env: TablecastEnv, actor: Actor) {
  const rows = await env.TABLECAST_DB.prepare(
    "SELECT id FROM config_drafts WHERE store_id=? AND status NOT IN ('discarded') ORDER BY updated_at DESC LIMIT 30",
  )
    .bind(actor.storeId)
    .all<{ id: string }>();
  return { drafts: await Promise.all(rows.results.map((row) => getDraft(env, actor, row.id))) };
}
export async function createDraft(env: TablecastEnv, actor: Actor) {
  requireManager(actor);
  ensure(actor.userId, "LOGIN_REQUIRED", 401);
  const catalog = await getCatalog(env, actor.storeId);
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.TABLECAST_DB.prepare(
    "INSERT INTO config_drafts(id,store_id,base_version,status,config_json,created_by,created_at,updated_at) VALUES(?,?,?,'draft',?,?,?,?)",
  )
    .bind(
      id,
      actor.storeId,
      catalog.version,
      JSON.stringify(catalog.configuration),
      actor.userId,
      now,
      now,
    )
    .run();
  return getDraft(env, actor, id);
}
export async function updateDraft(
  env: TablecastEnv,
  actor: Actor,
  id: string,
  input: { expectedVersion: number; configuration: Configuration },
) {
  requireManager(actor);
  const configuration = configurationSchema.parse(input.configuration);
  const result = await env.TABLECAST_DB.prepare(
    "UPDATE config_drafts SET config_json=?,version=version+1,status='draft',errors_json='[]',updated_at=? WHERE id=? AND store_id=? AND version=? AND status IN ('draft','ready')",
  )
    .bind(JSON.stringify(configuration), Date.now(), id, actor.storeId, input.expectedVersion)
    .run();
  ensure(result.meta.changes === 1, "DRAFT_CONFLICT");
  return getDraft(env, actor, id);
}
export async function validateDraft(
  env: TablecastEnv,
  actor: Actor,
  id: string,
  expectedVersion: number,
) {
  requireManager(actor);
  const draft = await getDraft(env, actor, id);
  const errors = configurationErrors(draft.configuration);
  const result = await env.TABLECAST_DB.prepare(
    "UPDATE config_drafts SET status=?,errors_json=?,updated_at=? WHERE id=? AND store_id=? AND version=? AND status IN ('draft','ready')",
  )
    .bind(
      errors.length ? "draft" : "ready",
      JSON.stringify(errors),
      Date.now(),
      id,
      actor.storeId,
      expectedVersion,
    )
    .run();
  ensure(result.meta.changes === 1, "DRAFT_CONFLICT");
  return getDraft(env, actor, id);
}
export async function discardDraft(
  env: TablecastEnv,
  actor: Actor,
  id: string,
  expectedVersion: number,
) {
  requireManager(actor);
  const result = await env.TABLECAST_DB.prepare(
    "UPDATE config_drafts SET status='discarded',updated_at=? WHERE id=? AND store_id=? AND version=? AND status IN ('draft','ready')",
  )
    .bind(Date.now(), id, actor.storeId, expectedVersion)
    .run();
  ensure(result.meta.changes === 1, "DRAFT_CONFLICT");
  return getDraft(env, actor, id);
}
export async function publishDraft(
  env: TablecastEnv,
  actor: Actor,
  id: string,
  input: { expectedVersion: number; baseVersion: number; idempotencyKey: string; approved: true },
) {
  requireManager(actor);
  ensure(actor.kind === "staff" && actor.userId, "HUMAN_APPROVAL_REQUIRED", 403);
  ensure(input.approved, "APPROVAL_REQUIRED", 422);
  const draft = await getDraft(env, actor, id);
  const now = Date.now();
  const previous = await env.TABLECAST_DB.prepare(
    "SELECT id,version,base_version FROM config_drafts WHERE store_id=? AND publish_key=?",
  )
    .bind(actor.storeId, input.idempotencyKey)
    .first<{ id: string; version: number; base_version: number }>();
  if (previous) {
    ensure(
      previous.id === id &&
        previous.version === input.expectedVersion &&
        previous.base_version === input.baseVersion,
      "IDEMPOTENCY_CONFLICT",
    );
    return draft;
  }
  ensure(
    draft.baseVersion === input.baseVersion && !configurationErrors(draft.configuration).length,
    "DRAFT_INVALID",
    422,
  );
  const guard =
    "EXISTS(SELECT 1 FROM config_drafts WHERE id=? AND store_id=? AND status='published' AND publish_key=?)";
  const result = await env.TABLECAST_DB.batch([
    env.TABLECAST_DB.prepare(
      "UPDATE config_drafts SET status='published',publish_key=?,updated_at=? WHERE id=? AND store_id=? AND status='ready' AND version=? AND base_version=? AND EXISTS(SELECT 1 FROM stores WHERE id=? AND config_version=?)",
    ).bind(
      input.idempotencyKey,
      now,
      id,
      actor.storeId,
      input.expectedVersion,
      input.baseVersion,
      actor.storeId,
      input.baseVersion,
    ),
    env.TABLECAST_DB.prepare(
      `UPDATE stores SET config_json=?,config_version=config_version+1,updated_at=? WHERE id=? AND config_version=? AND ${guard}`,
    ).bind(
      JSON.stringify(draft.configuration),
      now,
      actor.storeId,
      input.baseVersion,
      id,
      actor.storeId,
      input.idempotencyKey,
    ),
    env.TABLECAST_DB.prepare(
      `INSERT INTO config_releases(store_id,version,config_json,published_by,created_at) SELECT id,config_version,config_json,?,? FROM stores WHERE id=? AND ${guard}`,
    ).bind(actor.userId, now, actor.storeId, id, actor.storeId, input.idempotencyKey),
    env.TABLECAST_DB.prepare(
      `UPDATE confirmations SET status='invalid' WHERE store_id=? AND status IN ('pending','read') AND ${guard}`,
    ).bind(actor.storeId, id, actor.storeId, input.idempotencyKey),
    env.TABLECAST_DB.prepare(
      `INSERT INTO table_events(store_id,kind,data_json,created_at) SELECT id,'configuration.published',?,? FROM stores WHERE id=? AND ${guard}`,
    ).bind(
      JSON.stringify({ version: input.baseVersion + 1, draftId: id, actorId: actor.userId }),
      now,
      actor.storeId,
      id,
      actor.storeId,
      input.idempotencyKey,
    ),
  ]);
  ensure(result[0]?.meta.changes === 1, "DRAFT_CONFLICT");
  await notifyStore(env, actor.storeId);
  return getDraft(env, actor, id);
}
