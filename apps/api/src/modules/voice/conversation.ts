import { and, eq, exists, notExists, sql } from "drizzle-orm";
import type { z } from "zod";
import * as business from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import type { Actor } from "../auth/model";
import { notifyStore } from "../tables/mutations";
import { getSession } from "../tables/queries";
import type { voiceConversationSchema } from "./model";

export async function recordConversationItems(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof voiceConversationSchema>,
) {
  const session = await getSession(services, actor);
  ensure(
    session.voice_state === "active" && session.voice_session_id === input.voiceSessionId,
    "VOICE_SESSION_STALE",
    409,
  );
  const db = services.db;
  const current = and(
    eq(business.tableSessions.id, session.id),
    eq(business.tableSessions.store_id, actor.storeId),
    eq(business.tableSessions.voice_session_id, input.voiceSessionId),
    eq(business.tableSessions.voice_state, "active"),
    eq(business.tableSessions.status, "open"),
  );
  const statements = input.items.flatMap((item) => {
    const kind = item.role === "user" ? "voice.user" : "voice.assistant";
    const data = JSON.stringify({
      voiceSessionId: input.voiceSessionId,
      turnId: item.itemId,
      role: item.role,
      locale: session.locale,
      text: item.text,
      interrupted: item.interrupted,
    });
    const match = and(
      eq(business.tableEvents.store_id, actor.storeId),
      eq(business.tableEvents.table_session_id, session.id),
      eq(business.tableEvents.kind, kind),
      sql`json_extract(${business.tableEvents.data_json},'$.turnId')=${item.itemId}`,
    );
    return [
      db
        .update(business.tableEvents)
        .set({ data_json: data })
        .where(
          and(
            match,
            exists(
              db
                .select({ id: business.tableSessions.id })
                .from(business.tableSessions)
                .where(current),
            ),
            // 遅着した古いbatchで字幕を短くしない。同じ長さの中断通知は保存する。
            sql`length(json_extract(${business.tableEvents.data_json},'$.text'))<=length(${item.text})`,
            sql`${business.tableEvents.data_json}<>${data}`,
          ),
        ),
      // 既存行の更新も増加するcursorで他の画面へ伝える。
      db.insert(business.tableEvents).select(
        db
          .select({
            cursor: sql<number>`NULL`.as("cursor"),
            store_id: business.tableSessions.store_id,
            table_session_id: business.tableSessions.id,
            kind: sql<string>`'voice.transcribed'`.as("kind"),
            data_json: sql<string>`${JSON.stringify({ turnId: item.itemId })}`.as("data_json"),
            created_at: sql<number>`${Date.now()}`.as("created_at"),
          })
          .from(business.tableSessions)
          .where(and(current, sql`changes()=1`)),
      ),
      db.insert(business.tableEvents).select(
        db
          .select({
            cursor: sql<number>`NULL`.as("cursor"),
            store_id: business.tableSessions.store_id,
            table_session_id: business.tableSessions.id,
            kind: sql<string>`${kind}`.as("kind"),
            data_json: sql<string>`${data}`.as("data_json"),
            created_at: sql<number>`${Date.now()}`.as("created_at"),
          })
          .from(business.tableSessions)
          .where(
            and(
              current,
              notExists(
                db
                  .select({ cursor: business.tableEvents.cursor })
                  .from(business.tableEvents)
                  .where(match),
              ),
            ),
          ),
      ),
    ];
  });
  const [first, ...rest] = statements;
  ensure(first, "INVALID_INPUT", 422);
  const result = await db.batch([first, ...rest]);
  if (result.some((item) => item.meta.changes > 0))
    await notifyStore(services, actor.storeId, session.id);
  return { ok: true };
}
