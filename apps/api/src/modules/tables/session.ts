import { and, eq } from "drizzle-orm";
import type { TableRecord } from "../../db/records";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import * as business from "../../db/business-schema";
import { ensure } from "../../platform/errors";
import { getDemoRecord } from "../demo/queries";

export async function getSession(services: ApiServices, actor: Actor): Promise<TableRecord> {
  const db = services.db;

  ensure(actor.tableSessionId, "TABLE_REQUIRED", 403);
  const row = await db
    .select()
    .from(business.tableSessions)
    .where(
      and(
        eq(business.tableSessions.id, actor.tableSessionId),
        eq(business.tableSessions.store_id, actor.storeId),
      ),
    )
    .get();
  return validateSession(services, actor, row);
}

export async function validateSession(
  services: ApiServices,
  actor: Actor,
  row: TableRecord | undefined,
): Promise<TableRecord> {
  ensure(row, "TABLE_NOT_FOUND", 404);
  if (row.kind === "demo") {
    await getDemoRecord(services, actor);
  } else ensure(!actor.demoId, "DEMO_NOT_FOUND", 404);
  if (actor.kind === "device") ensure(row.status === "open", "SESSION_CLOSED", 403);
  if (actor.kind === "voice")
    ensure(
      row.status === "open" &&
        row.voice_state === "active" &&
        row.voice_session_id === actor.voiceSessionId &&
        (!actor.turnId || row.active_turn_id === actor.turnId),
      "VOICE_SESSION_STALE",
      409,
    );
  return row;
}
