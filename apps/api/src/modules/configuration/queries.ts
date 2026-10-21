import { and, desc, eq, inArray, lt, ne, or, sql } from "drizzle-orm";
import { unionAll } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import * as business from "../../db/business-schema";
import { user } from "../../db/identity-schema";
import { ensure } from "../../platform/errors";
import { requireManagerRead } from "../auth/policy";
import { configurationErrors } from "../catalog/pricing";
import { catalogQuery, catalogValue } from "../catalog/queries";
import { configurationDifferences } from "./differences";
import {
  type Catalog,
  type ConfigDraft,
  configurationHistoryPageSchema,
  type configurationHistoryQuerySchema,
  configurationIssueSchema,
  type ConfigurationRelease,
  configurationReleaseSchema,
  configurationSchema,
  draftChoiceSchema,
  type DraftChoicesQuery,
} from "./model";

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
      baseVersion: sql<null | number>`null`.as("base_version"),
      sourceDraftId: business.configReleases.source_draft_id,
      restoredFromVersion: sql<null | number>`null`.as("restored_from_version"),
      status: sql<string>`'published'`.as("status"),
      at: sql<number>`${business.configReleases.created_at}`.as("at"),
      actorId: sql<string>`${business.configReleases.published_by}`.as("actor_id"),
      actorName: sql<null | string>`${user.name}`.as("actor_name"),
      actorEmail: sql<null | string>`${user.email}`.as("actor_email"),
      actorImage: sql<null | string>`${user.image}`.as("actor_image"),
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
      sourceDraftId: sql<null | string>`null`.as("source_draft_id"),
      restoredFromVersion: business.configDrafts.restored_from_version,
      status: business.configDrafts.status,
      at: sql<number>`${business.configDrafts.updated_at}`.as("at"),
      actorId: sql<string>`${business.configDrafts.created_by}`.as("actor_id"),
      actorName: sql<null | string>`${user.name}`.as("actor_name"),
      actorEmail: sql<null | string>`${user.email}`.as("actor_email"),
      actorImage: sql<null | string>`${user.image}`.as("actor_image"),
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
        publisherEmail: user.email,
        publisherImage: user.image,
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
