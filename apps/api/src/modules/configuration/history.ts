import type { z } from "zod";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { unionAll } from "drizzle-orm/sqlite-core";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import * as business from "../../db/business-schema";
import { user } from "../../db/identity-schema";
import { ensure } from "../../platform/errors";
import { requireManager, requireManagerRead } from "../auth/policy";
import { configurationDifferences } from "./differences";
import {
  configurationHistoryPageSchema,
  type configurationHistoryQuerySchema,
  type ConfigurationRelease,
  configurationReleaseSchema,
  type configurationRestoreSchema,
  configurationSchema,
} from "./model";
import { getDraft } from "./queries";

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
            publish_key: sql<null | string>`null`.as("publish_key"),
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
