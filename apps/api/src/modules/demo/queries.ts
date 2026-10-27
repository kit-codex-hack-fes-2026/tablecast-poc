import { and, eq } from "drizzle-orm";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import type { Demo } from "./model";
import * as business from "../../db/business-schema";
import { member } from "../../db/identity-schema";
import { ensure } from "../../platform/errors";
import { configurationSchema } from "../configuration/model";
import { sessionPlanUsage } from "../orders/queries";
import { tablePlanSchema } from "../tables/model";

export async function getDemoRecord(services: ApiServices, actor: Actor, authoriseStore = false) {
  ensure(actor.demoId && actor.demoId === actor.tableSessionId, "DEMO_NOT_FOUND", 404);
  const result = await services.db
    .select({
      demo: business.demoSessions,
      planUsage: sessionPlanUsage(services.db),
      session: business.tableSessions,
      role: member.role,
      storeName: business.stores.name,
    })
    .from(business.stores)
    .leftJoin(
      business.tableSessions,
      and(
        eq(business.tableSessions.store_id, business.stores.id),
        eq(business.tableSessions.id, actor.demoId),
        eq(business.tableSessions.kind, "demo"),
      ),
    )
    .leftJoin(
      business.demoSessions,
      eq(business.demoSessions.session_id, business.tableSessions.id),
    )
    .leftJoin(
      member,
      and(
        eq(member.organizationId, business.stores.organization_id),
        eq(
          member.userId,
          actor.kind === "voice" ? business.demoSessions.created_by : (actor.userId ?? ""),
        ),
      ),
    )
    .where(eq(business.stores.id, actor.storeId))
    .get();
  if (authoriseStore && actor.kind !== "voice") {
    ensure(result?.role, "STORE_FORBIDDEN", 403);
    ensure(["owner", "admin"].includes(result.role), "ADMIN_REQUIRED", 403);
  }
  ensure(result?.demo && result.session, "DEMO_NOT_FOUND", 404);
  ensure(actor.kind === "voice" || actor.userId === result.demo.created_by, "DEMO_NOT_FOUND", 404);
  ensure(result.role && ["owner", "admin"].includes(result.role), "ADMIN_REQUIRED", 403);
  services.tableAccess.demo = {
    planUsage: result.planUsage,
    id: actor.demoId,
    storeId: actor.storeId,
    userId: actor.userId,
    voiceSessionId: actor.voiceSessionId,
    configuration: {
      config_version: result.demo.config_version,
      config_json: result.demo.config_json,
      storeName: result.storeName,
    },
  };
  return { ...result, demo: result.demo, session: result.session };
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
