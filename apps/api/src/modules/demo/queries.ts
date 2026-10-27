import { and, eq } from "drizzle-orm";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import type { Demo } from "./model";
import * as business from "../../db/business-schema";
import { member } from "../../db/identity-schema";
import { ensure } from "../../platform/errors";
import { configurationSchema } from "../configuration/model";
import { tablePlanSchema } from "../tables/model";

export async function getDemoRecord(services: ApiServices, actor: Actor) {
  ensure(actor.demoId && actor.demoId === actor.tableSessionId, "DEMO_NOT_FOUND", 404);
  const result = await services.db
    .select({
      demo: business.demoSessions,
      session: business.tableSessions,
      role: member.role,
      storeName: business.stores.name,
    })
    .from(business.demoSessions)
    .innerJoin(
      business.tableSessions,
      eq(business.tableSessions.id, business.demoSessions.session_id),
    )
    .innerJoin(business.stores, eq(business.stores.id, business.tableSessions.store_id))
    .leftJoin(
      member,
      and(
        eq(member.organizationId, business.stores.organization_id),
        eq(member.userId, business.demoSessions.created_by),
      ),
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
  ensure(result.role && ["owner", "admin"].includes(result.role), "ADMIN_REQUIRED", 403);
  services.tableAccess.demo = {
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
