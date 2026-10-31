import type { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import type { ApiServices } from "../../../platform/context";
import type { Actor } from "../../auth/model";
import type { draftPublishSchema } from "../model";
import * as business from "../../../db/business-schema";
import { ensure } from "../../../platform/errors";
import { observeOperation } from "../../../platform/telemetry";
import { requireManager } from "../../auth/policy";
import { losesConditions } from "../../catalog/conditions";
import { losesFoodChanges } from "../../catalog/food";
import { configurationErrors } from "../../catalog/pricing";
import { getCatalog } from "../../catalog/queries";
import { requireConfigurationImages } from "../../media/service";
import { notifyStore } from "../../tables/mutations";
import { voiceConfigurationErrors } from "../../voice/catalog";
import { getDraft } from "../queries";

export async function publishDraft(
  services: ApiServices,
  actor: Actor,
  id: string,
  input: z.infer<typeof draftPublishSchema>,
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
      const findPublishedDraft = () =>
        db
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
      const previous = await findPublishedDraft();
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
        !losesConditions(catalog.configuration, draft.configuration) &&
          !losesFoodChanges(catalog.configuration, draft.configuration),
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
        const retry = await findPublishedDraft();
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
