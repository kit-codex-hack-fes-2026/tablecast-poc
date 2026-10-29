import type { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { ApiServices } from "../../../platform/context";
import type { Actor } from "../../auth/model";
import * as business from "../../../db/business-schema";
import { ensure } from "../../../platform/errors";
import { requireManager } from "../../auth/policy";
import { losesConditions } from "../../catalog/conditions";
import { losesFoodChanges } from "../../catalog/food";
import { configurationErrors } from "../../catalog/pricing";
import { getCatalog } from "../../catalog/queries";
import { requireConfigurationImages } from "../../media/service";
import { voiceConfigurationErrors } from "../../voice/catalog";
import { readConfiguration } from "../food-compatibility";
import {
  type configurationRestoreSchema,
  configurationSchema,
  type draftUpdateSchema,
} from "../model";
import { getConfigurationRelease, getDraft } from "../queries";

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
  input: z.infer<typeof draftUpdateSchema>,
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
  const previousConfiguration = readConfiguration(JSON.parse(previous.configuration));
  ensure(
    !losesFoodChanges(previousConfiguration, configuration),
    "CONFIGURATION_FORMAT_UNSUPPORTED",
    422,
  );
  ensure(
    !losesConditions(previousConfiguration, configuration),
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
