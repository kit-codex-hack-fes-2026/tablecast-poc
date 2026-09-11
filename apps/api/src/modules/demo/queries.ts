import { and, eq } from "drizzle-orm";
import * as business from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import type { Actor } from "../auth/model";
import { findStoreMembership } from "../auth/queries";
import { configurationSchema } from "../configuration/model";
import { tablePlanSchema } from "../tables/model";
import type { Demo } from "./model";

export async function getDemoRecord(services: ApiServices, actor: Actor) {
  ensure(actor.demoId && actor.demoId === actor.tableSessionId, "DEMO_NOT_FOUND", 404);
  const result = await services.db
    .select({ demo: business.demoSessions, session: business.tableSessions })
    .from(business.demoSessions)
    .innerJoin(
      business.tableSessions,
      eq(business.tableSessions.id, business.demoSessions.session_id),
    )
    .where(
      and(
        eq(business.demoSessions.session_id, actor.demoId),
        eq(business.tableSessions.store_id, actor.storeId),
        eq(business.tableSessions.kind, "demo"),
      ),
    )
    .get();
  ensure(result, "DEMO_NOT_FOUND", 404);
  ensure(actor.kind === "voice" || actor.userId === result.demo.created_by, "DEMO_NOT_FOUND", 404);
  const member = await findStoreMembership(services, result.demo.created_by, actor.storeId);
  ensure(member && ["owner", "admin"].includes(member.role), "ADMIN_REQUIRED", 403);
  return result;
}
export async function getDemo(services: ApiServices, actor: Actor): Promise<Demo> {
  const { demo, session } = await getDemoRecord(services, actor);
  return {
    id: session.id,
    sourceDraftId: demo.source_draft_id,
    sourceVersion: demo.source_version,
    version: demo.config_version,
    configuration: configurationSchema.parse(JSON.parse(demo.config_json)),
    planId: session.plan_json ? tablePlanSchema.parse(JSON.parse(session.plan_json)).id : null,
    guestCount: session.guest_count,
  };
}
