import { and, count, eq, sql } from "drizzle-orm";
import type { ApiServices } from "../../../platform/context";
import type { Actor } from "../../auth/model";
import * as business from "../../../db/business-schema";
import { ensure } from "../../../platform/errors";
import { notifyStore } from "../../tables/mutations";
import { voiceReferenceSchema } from "../model";
import { referenceMetadata } from "./reference-metadata";

export async function showReference(
  services: ApiServices,
  actor: Actor,
  input: { title?: string; url: string },
  signal: AbortSignal,
) {
  ensure(actor.kind === "voice" && actor.voiceSessionId && actor.turnId, "VOICE_REQUIRED", 403);
  const reference = voiceReferenceSchema.parse(await referenceMetadata(input, signal));
  signal.throwIfAborted();
  const db = services.db;
  const result = await db.insert(business.tableEvents).select(
    db
      .select({
        cursor: sql<number>`NULL`.as("cursor"),
        store_id: business.tableSessions.store_id,
        table_session_id: business.tableSessions.id,
        kind: sql<string>`'voice.reference'`.as("kind"),
        data_json: sql<string>`${JSON.stringify({ turnId: actor.turnId, reference })}`.as(
          "data_json",
        ),
        created_at: sql<number>`${Date.now()}`.as("created_at"),
      })
      .from(business.tableSessions)
      .where(
        and(
          eq(business.tableSessions.id, actor.tableSessionId ?? ""),
          eq(business.tableSessions.store_id, actor.storeId),
          eq(business.tableSessions.voice_session_id, actor.voiceSessionId),
          eq(business.tableSessions.voice_state, "active"),
          eq(business.tableSessions.active_turn_id, actor.turnId),
          eq(business.tableSessions.status, "open"),
          sql`(${db
            .select({ value: count() })
            .from(business.tableEvents)
            .where(
              and(
                eq(business.tableEvents.table_session_id, actor.tableSessionId ?? ""),
                eq(business.tableEvents.store_id, actor.storeId),
                eq(business.tableEvents.kind, "voice.reference"),
                sql`json_extract(${business.tableEvents.data_json},'$.turnId')=${actor.turnId}`,
              ),
            )})<3`,
        ),
      ),
  );
  ensure(result.meta.changes === 1, "REFERENCE_NOT_SHOWN", 409);
  await notifyStore(services, actor.storeId, actor.tableSessionId, {
    cursor: result.meta.last_row_id,
    demoId: actor.demoId,
  });
  // 画像・OGPは表示イベントにだけ置き、LLMへ再複製しない。
  return { url: reference.url, title: reference.title, shown: true };
}
