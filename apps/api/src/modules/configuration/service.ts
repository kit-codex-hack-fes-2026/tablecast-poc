import { unionAll } from "drizzle-orm/sqlite-core";
import { user } from "../../db/auth-schema";
import { observeOperation } from "../../platform/telemetry";
import { and, desc, eq, inArray, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import * as business from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import { DomainError, ensure } from "../../platform/errors";
import type { Actor } from "../auth/model";
import { requireManager, requireManagerRead } from "../auth/policy";
import { configurationErrors, priceCart } from "../catalog/pricing";
import { evaluateCondition, losesConditions, productConditionErrors } from "../catalog/conditions";
import type { OptionCondition } from "../catalog/model";
import { catalogQuery, catalogValue, getCatalog } from "../catalog/queries";
import { notifyStore } from "../tables/mutations";
import { voiceConfigurationErrors } from "../voice/catalog";
import { requireConfigurationImages } from "../media/service";
import {
  configurationIssueSchema,
  configurationSchema,
  type conditionPreviewSchema,
  draftChoiceSchema,
  type Catalog,
  type ConfigDraft,
  type Configuration,
  type DraftChoicesQuery,
  configurationHistoryPageSchema,
  configurationReleaseSchema,
  type ConfigurationRelease,
  type configurationHistoryQuerySchema,
  type configurationRestoreSchema,
} from "./model";
function hasSensitiveField(value: unknown, path: string): boolean {
  return (
    /price|allergen|vegan|crossContact|plans/.test(path) ||
    (value !== null &&
      typeof value === "object" &&
      Object.entries(value).some(([key, child]) => hasSensitiveField(child, key)))
  );
}
export function configurationDifferences(
  before: unknown,
  after: unknown,
  path = "",
): ConfigDraft["changes"] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (
    !/^cast\.instructions\.(ja|en)$/.test(path) &&
    before !== null &&
    after !== null &&
    typeof before === "object" &&
    typeof after === "object"
  ) {
    const left = Object.fromEntries(Object.entries(before));
    const right = Object.fromEntries(Object.entries(after));
    return [...new Set([...Object.keys(left), ...Object.keys(right)])].flatMap((key) =>
      configurationDifferences(
        left[key] ?? null,
        right[key] ?? null,
        path ? `${path}.${key}` : key,
      ),
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

  const [drafts, catalogs] = await db.batch([
    db
      .select()
      .from(business.configDrafts)
      .where(
        and(eq(business.configDrafts.id, id), eq(business.configDrafts.store_id, actor.storeId)),
      ),
    catalogQuery(db, actor.storeId),
  ]);
  const row = drafts[0];
  ensure(row, "DRAFT_NOT_FOUND", 404);
  const catalog = catalogValue(catalogs[0]);
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
    changes: configurationDifferences(
      {
        ...catalog.configuration,
        ...(configuration.storeName !== undefined ? { storeName: catalog.storeName } : {}),
      },
      configuration,
    ),
  };
}
export async function listDrafts(services: ApiServices, actor: Actor) {
  const db = services.db;
  const [rows, catalogs] = await db.batch([
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
    catalogQuery(db, actor.storeId),
  ]);
  const catalog = catalogValue(catalogs[0]);
  return { drafts: rows.map((row) => draftValue(row, catalog)) };
}
export async function listDraftChoices(
  services: ApiServices,
  actor: Actor,
  query: DraftChoicesQuery,
) {
  const db = services.db;
  const [rows, catalogs] = await db.batch([
    db
      .select()
      .from(business.configDrafts)
      .where(
        and(
          eq(business.configDrafts.store_id, actor.storeId),
          inArray(business.configDrafts.status, ["draft", "ready"]),
          query.beforeUpdatedAt !== undefined && query.beforeId !== undefined
            ? or(
                lt(business.configDrafts.updated_at, query.beforeUpdatedAt),
                and(
                  eq(business.configDrafts.updated_at, query.beforeUpdatedAt),
                  lt(business.configDrafts.id, query.beforeId),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(business.configDrafts.updated_at), desc(business.configDrafts.id))
      .limit(31),
    catalogQuery(db, actor.storeId),
  ]);
  const catalog = catalogValue(catalogs[0]);
  const page = rows.slice(0, 30);
  const last = page.at(-1);
  return {
    drafts: page.map((row) => {
      const draft = draftValue(row, catalog);
      return {
        id: draft.id,
        baseVersion: draft.baseVersion,
        version: draft.version,
        status: draft.status,
        updatedAt: draft.updatedAt,
        changeCount: draft.changes.length,
        sections: draftChoiceSchema.shape.sections.element.options.filter((section) =>
          draft.changes.some((change) => change.path.split(".")[0] === section),
        ),
      };
    }),
    publishedVersion: catalog.version,
    nextCursor:
      rows.length > 30 && last ? { beforeUpdatedAt: last.updated_at, beforeId: last.id } : null,
  };
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
  input: { expectedVersion: number; configuration: Configuration; instructionFormatVersion?: 1 },
) {
  const db = services.db;

  requireManager(actor);
  const configuration = configurationSchema.parse(input.configuration);
  const previous = await db
    .select({ configuration: business.configDrafts.config_json })
    .from(business.configDrafts)
    .where(
      and(
        eq(business.configDrafts.id, id),
        eq(business.configDrafts.store_id, actor.storeId),
        eq(business.configDrafts.version, input.expectedVersion),
      ),
    )
    .get();
  ensure(previous, "DRAFT_CONFLICT");
  ensure(
    !losesConditions(configurationSchema.parse(JSON.parse(previous.configuration)), configuration),
    "CONFIGURATION_FORMAT_UNSUPPORTED",
    422,
  );
  ensure(
    input.instructionFormatVersion === 1 ||
      Object.values(configuration.cast.instructions).every((value) => typeof value === "string"),
    "DRAFT_CONFLICT",
    409,
  );
  await requireConfigurationImages(services, actor, configuration);
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
      and(
        eq(business.configDrafts.id, id),
        eq(business.configDrafts.store_id, actor.storeId),
        eq(business.configDrafts.version, input.expectedVersion),
        input.instructionFormatVersion === 1
          ? undefined
          : sql`json_type(${business.configDrafts.config_json}, '$.cast.instructions.ja') = 'text' AND json_type(${business.configDrafts.config_json}, '$.cast.instructions.en') = 'text'`,
        inArray(business.configDrafts.status, ["draft", "ready"]),
      ),
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
      and(
        eq(business.configDrafts.id, id),
        eq(business.configDrafts.store_id, actor.storeId),
        eq(business.configDrafts.version, expectedVersion),
        inArray(business.configDrafts.status, ["draft", "ready"]),
      ),
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
      and(
        eq(business.configDrafts.id, id),
        eq(business.configDrafts.store_id, actor.storeId),
        eq(business.configDrafts.version, expectedVersion),
        inArray(business.configDrafts.status, ["draft", "ready"]),
      ),
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
  return observeOperation(
    "tablecast.configuration.publish",
    async () => {
      const db = services.db;

      requireManager(actor);
      ensure(actor.kind === "staff" && actor.userId, "HUMAN_APPROVAL_REQUIRED", 403);
      ensure(input.approved, "APPROVAL_REQUIRED", 422);
      const draft = await getDraft(services, actor, id);
      const now = Date.now();
      const previous = await db
        .select({
          id: business.configDrafts.id,
          version: business.configDrafts.version,
          base_version: business.configDrafts.base_version,
        })
        .from(business.configDrafts)
        .where(
          and(
            eq(business.configDrafts.store_id, actor.storeId),
            eq(business.configDrafts.publish_key, input.idempotencyKey),
          ),
        )
        .get();
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
      ensure(
        !losesConditions(catalog.configuration, draft.configuration),
        "CONFIGURATION_FORMAT_UNSUPPORTED",
        422,
      );
      await requireConfigurationImages(services, actor, draft.configuration);
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
            name: draft.configuration.storeName,
            config_json: JSON.stringify(draft.configuration),
            config_version: sql`config_version+1`,
            updated_at: now,
          })
          .where(sql`id=${actor.storeId} AND config_version=${input.baseVersion} AND ${guard}`),
        db.insert(business.configReleases).select(
          db
            .select({
              store_id: business.stores.id,
              version: business.stores.config_version,
              config_json: business.stores.config_json,
              published_by: sql<string>`${actor.userId}`.as("published_by"),
              source_draft_id: sql<string>`${id}`.as("source_draft_id"),
              created_at: sql<number>`${now}`.as("created_at"),
            })
            .from(business.stores)
            .where(and(eq(business.stores.id, actor.storeId), guard)),
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
          .where(
            sql`store_id=${actor.storeId} AND table_session_id IN (SELECT id FROM table_sessions WHERE kind='table') AND status IN ('pending','read') AND ${guard}`,
          ),
      ]);
      if (result[0]?.meta.changes !== 1) {
        const retry = await db
          .select({
            id: business.configDrafts.id,
            version: business.configDrafts.version,
            base_version: business.configDrafts.base_version,
          })
          .from(business.configDrafts)
          .where(
            and(
              eq(business.configDrafts.store_id, actor.storeId),
              eq(business.configDrafts.publish_key, input.idempotencyKey),
            ),
          )
          .get();
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
    },
    { env: services.env, input: { actor, id, input } },
  );
}

export function previewConditions(actor: Actor, input: z.infer<typeof conditionPreviewSchema>) {
  requireManager(actor);
  const errors = productConditionErrors(input.product);
  const option = input.product.modifiers
    .flatMap((group) => group.options)
    .find((item) => item.id === input.optionId);
  ensure(option, "OPTION_NOT_FOUND", 422);
  const selected = new Set(input.selections.map((selection) => selection.optionId));
  const applied = selected.has(option.id);
  const nodes = (
    expression: OptionCondition,
    path: (string | number)[] = [],
  ): { path: (string | number)[]; matched: boolean }[] => [
    { path, matched: evaluateCondition(expression, selected) },
    ...(expression.kind === "not"
      ? nodes(expression.child, [...path, "child"])
      : expression.kind === "option"
        ? []
        : expression.children.flatMap((child, index) =>
            nodes(child, [...path, "children", index]),
          )),
  ];
  let selectionError: string | null = null;
  try {
    const cart = priceCart(
      { products: [input.product] },
      [
        {
          id: "tablecast-condition-preview",
          productId: input.product.id,
          quantity: 1,
          selections: input.selections,
        },
      ],
      0,
    );
    if (!cart.complete) selectionError = "CART_INCOMPLETE";
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    selectionError = error.code;
  }
  return {
    errors,
    selectionError,
    applied,
    conditions: (["requires", "excludes"] as const).map((relation) => {
      const expression = option.conditions?.[relation];
      const matched = expression
        ? evaluateCondition(expression, selected)
        : relation === "requires"
          ? option.requires.every((id) => selected.has(id))
          : option.excludes.some((id) => selected.has(id));
      return {
        relation,
        matched,
        satisfied: !applied || (relation === "requires" ? matched : !matched),
        nodes: expression ? nodes(expression) : [],
      };
    }),
  };
}

export async function getConfigurationHistory(
  { db }: ApiServices,
  actor: Actor,
  input: z.infer<typeof configurationHistoryQuerySchema>,
) {
  requireManagerRead(actor);
  const releases = db
    .select({
      kind: sql<string>`'release'`.as("kind"),
      id: sql<string>`cast(${business.configReleases.version} as text)`.as("id"),
      version: business.configReleases.version,
      baseVersion: sql<number | null>`null`.as("base_version"),
      sourceDraftId: business.configReleases.source_draft_id,
      restoredFromVersion: sql<number | null>`null`.as("restored_from_version"),
      status: sql<string>`'published'`.as("status"),
      at: sql<number>`${business.configReleases.created_at}`.as("at"),
      actorId: sql<string>`${business.configReleases.published_by}`.as("actor_id"),
      actorName: sql<string | null>`${user.name}`.as("actor_name"),
    })
    .from(business.configReleases)
    .leftJoin(user, eq(user.id, business.configReleases.published_by))
    .where(eq(business.configReleases.store_id, actor.storeId));
  const drafts = db
    .select({
      kind: sql<string>`'draft'`.as("kind"),
      id: business.configDrafts.id,
      version: business.configDrafts.version,
      baseVersion: business.configDrafts.base_version,
      sourceDraftId: sql<string | null>`null`.as("source_draft_id"),
      restoredFromVersion: business.configDrafts.restored_from_version,
      status: business.configDrafts.status,
      at: sql<number>`${business.configDrafts.updated_at}`.as("at"),
      actorId: sql<string>`${business.configDrafts.created_by}`.as("actor_id"),
      actorName: sql<string | null>`${user.name}`.as("actor_name"),
    })
    .from(business.configDrafts)
    .leftJoin(user, eq(user.id, business.configDrafts.created_by))
    .where(eq(business.configDrafts.store_id, actor.storeId));
  const history = unionAll(releases, drafts).as("configuration_history");
  const [rows, current] = await db.batch([
    db
      .select()
      .from(history)
      .where(
        input.beforeAt !== undefined &&
          input.beforeKind !== undefined &&
          input.beforeId !== undefined
          ? or(
              lt(history.at, input.beforeAt),
              and(
                eq(history.at, input.beforeAt),
                or(
                  lt(history.kind, input.beforeKind),
                  and(eq(history.kind, input.beforeKind), lt(history.id, input.beforeId)),
                ),
              ),
            )
          : undefined,
      )
      .orderBy(desc(history.at), desc(history.kind), desc(history.id))
      .limit(31),
    db
      .select({ version: business.stores.config_version })
      .from(business.stores)
      .where(eq(business.stores.id, actor.storeId)),
  ]);
  ensure(current[0], "STORE_NOT_FOUND", 404);
  const entries = rows.slice(0, 30);
  const last = entries.at(-1);
  return configurationHistoryPageSchema.parse({
    entries,
    publishedVersion: current[0].version,
    nextCursor:
      rows.length > 30 && last
        ? { beforeAt: last.at, beforeKind: last.kind, beforeId: last.id }
        : null,
  });
}

export async function getConfigurationRelease(
  { db }: ApiServices,
  actor: Actor,
  version: number,
): Promise<ConfigurationRelease> {
  requireManagerRead(actor);
  ensure(Number.isSafeInteger(version) && version > 0, "INVALID_INPUT", 400);
  const [releases, current] = await db.batch([
    db
      .select({
        version: business.configReleases.version,
        sourceDraftId: business.configReleases.source_draft_id,
        publishedAt: business.configReleases.created_at,
        publishedBy: business.configReleases.published_by,
        publisherName: user.name,
        snapshot: business.configReleases.config_json,
      })
      .from(business.configReleases)
      .leftJoin(user, eq(user.id, business.configReleases.published_by))
      .where(
        and(
          eq(business.configReleases.store_id, actor.storeId),
          eq(business.configReleases.version, version),
        ),
      ),
    db
      .select({
        version: business.stores.config_version,
        name: business.stores.name,
        snapshot: business.stores.config_json,
      })
      .from(business.stores)
      .where(eq(business.stores.id, actor.storeId)),
  ]);
  const row = releases[0];
  ensure(row, "CONFIGURATION_RELEASE_NOT_FOUND", 404);
  ensure(current[0], "STORE_NOT_FOUND", 404);
  const { snapshot, ...metadata } = row;
  const parsed = configurationSchema.safeParse(JSON.parse(snapshot));
  const configuration = parsed.success ? parsed.data : null;
  const published = configurationSchema.parse(JSON.parse(current[0].snapshot));
  return configurationReleaseSchema.parse({
    ...metadata,
    publishedVersion: current[0].version,
    configuration,
    changes: configuration
      ? configurationDifferences(
          {
            ...published,
            ...(configuration.storeName !== undefined ? { storeName: current[0].name } : {}),
          },
          configuration,
        )
      : [],
  });
}

export async function restoreConfigurationRelease(
  services: ApiServices,
  actor: Actor,
  version: number,
  input: z.infer<typeof configurationRestoreSchema>,
) {
  requireManager(actor);
  ensure(actor.userId, "LOGIN_REQUIRED", 401);
  const release = await getConfigurationRelease(services, actor, version);
  ensure(release.configuration, "CONFIGURATION_FORMAT_UNSUPPORTED", 422);
  const { db } = services;
  const now = Date.now();
  const [, saved] = await db.batch([
    db
      .insert(business.configDrafts)
      .select(
        db
          .select({
            id: sql<string>`${input.draftId}`.as("id"),
            store_id: business.stores.id,
            base_version: business.stores.config_version,
            version: sql<number>`1`.as("version"),
            status: sql<string>`'draft'`.as("status"),
            config_json: sql<string>`${JSON.stringify(release.configuration)}`.as("config_json"),
            errors_json: sql<string>`'[]'`.as("errors_json"),
            created_by: sql<string>`${actor.userId}`.as("created_by"),
            publish_key: sql<string | null>`null`.as("publish_key"),
            restored_from_version: sql<number>`${version}`.as("restored_from_version"),
            created_at: sql<number>`${now}`.as("created_at"),
            updated_at: sql<number>`${now}`.as("updated_at"),
          })
          .from(business.stores)
          .where(
            and(
              eq(business.stores.id, actor.storeId),
              eq(business.stores.config_version, input.baseVersion),
            ),
          ),
      )
      .onConflictDoNothing({ target: business.configDrafts.id }),
    db
      .select({
        id: business.configDrafts.id,
        createdBy: business.configDrafts.created_by,
        baseVersion: business.configDrafts.base_version,
        restoredFromVersion: business.configDrafts.restored_from_version,
      })
      .from(business.configDrafts)
      .where(
        and(
          eq(business.configDrafts.id, input.draftId),
          eq(business.configDrafts.store_id, actor.storeId),
        ),
      ),
  ]);
  const row = saved[0];
  ensure(
    row &&
      row.createdBy === actor.userId &&
      row.baseVersion === input.baseVersion &&
      row.restoredFromVersion === version,
    "DRAFT_CONFLICT",
  );
  return getDraft(services, actor, row.id);
}
