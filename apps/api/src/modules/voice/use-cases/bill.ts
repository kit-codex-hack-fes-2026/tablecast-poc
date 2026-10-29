import { and, eq, gt, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { ApiServices } from "../../../platform/context";
import type { Actor } from "../../auth/model";
import * as business from "../../../db/business-schema";
import { ensure } from "../../../platform/errors";

export async function requireBillConfirmation(services: ApiServices, actor: Actor, turnId: string) {
  ensure(
    actor.kind === "voice" && actor.turnId && actor.turnId !== turnId,
    "APPROVAL_REQUIRED",
    422,
  );
  // JSON内のtool識別は既存イベント形式に合わせる。所属・session・期限は型付きqueryで検査する。
  const used = alias(business.tableEvents, "tablecast_used_bill_confirmation");
  const confirmation = await services.db
    .select({ cursor: business.tableEvents.cursor })
    .from(business.tableEvents)
    .innerJoin(business.voiceTurns, eq(business.voiceTurns.id, turnId))
    .where(
      and(
        eq(business.tableEvents.store_id, actor.storeId),
        eq(business.tableEvents.table_session_id, actor.tableSessionId ?? ""),
        eq(business.tableEvents.kind, "voice.tool"),
        gt(business.tableEvents.created_at, Date.now() - 120_000),
        eq(business.voiceTurns.voice_session_id, actor.voiceSessionId ?? ""),
        eq(business.voiceTurns.table_session_id, actor.tableSessionId ?? ""),
        eq(business.voiceTurns.store_id, actor.storeId),
        sql`json_extract(${business.tableEvents.data_json}, '$.turnId')=${turnId}`,
        sql`json_extract(${business.tableEvents.data_json}, '$.toolName')='prepareBill'`,
        sql`json_extract(${business.tableEvents.data_json}, '$.state')='completed'`,
        notExists(
          services.db
            .select({ cursor: used.cursor })
            .from(used)
            .where(
              and(
                eq(used.store_id, actor.storeId),
                eq(used.table_session_id, actor.tableSessionId ?? ""),
                eq(used.kind, "voice.tool"),
                gt(used.cursor, business.tableEvents.cursor),
                sql`json_extract(${used.data_json}, '$.toolName')='requestBill'`,
                sql`json_extract(${used.data_json}, '$.state')='completed'`,
              ),
            ),
        ),
      ),
    )
    .limit(1)
    .get();
  ensure(confirmation, "APPROVAL_REQUIRED", 422);
}
