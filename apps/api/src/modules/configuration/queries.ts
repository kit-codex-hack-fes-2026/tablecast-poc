import { and, desc, eq, inArray, lt, ne, or } from "drizzle-orm";
import { z } from "zod";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import * as business from "../../db/business-schema";
import { ensure } from "../../platform/errors";
import { configurationErrors } from "../catalog/pricing";
import { catalogQuery, catalogValue } from "../catalog/queries";
import { configurationDifferences } from "./differences";
import {
  type Catalog,
  type ConfigDraft,
  configurationIssueSchema,
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
