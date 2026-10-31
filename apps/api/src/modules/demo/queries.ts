import { and, eq } from "drizzle-orm";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import type { Demo } from "./model";
import * as business from "../../db/business-schema";
import { member } from "../../db/identity-schema";
import { ensure } from "../../platform/errors";
import { readConfiguration } from "../configuration/food-compatibility";
import { sessionPlanUsage } from "../orders/queries";
import { tablePlanSchema } from "../tables/model";

function authoriseDemo<
  T extends {
    demo: null | { created_by: string };
    role: null | string;
    session: null | { id: string };
  },
>(result: T | undefined, actor: Actor, authoriseStore: boolean) {
  if (authoriseStore && actor.kind !== "voice") {
    ensure(result?.role, "STORE_FORBIDDEN", 403);
    ensure(["owner", "admin"].includes(result.role), "ADMIN_REQUIRED", 403);
  }
  ensure(result?.demo && result.session, "DEMO_NOT_FOUND", 404);
  ensure(actor.kind === "voice" || actor.userId === result.demo.created_by, "DEMO_NOT_FOUND", 404);
  ensure(result.role && ["owner", "admin"].includes(result.role), "ADMIN_REQUIRED", 403);
  return { ...result, demo: result.demo, session: result.session };
}

/** 画像では所有者・管理権限だけを確認し、設定・カート・利用集計を読まない。 */
export async function getDemoImageAccess(services: ApiServices, actor: Actor) {
  ensure(actor.demoId && actor.demoId === actor.tableSessionId, "DEMO_NOT_FOUND", 404);
  const result = await services.db
    .select({
      demo: { created_by: business.demoSessions.created_by },
      session: { id: business.tableSessions.id },
      role: member.role,
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
        eq(member.userId, actor.userId ?? ""),
      ),
    )
    .where(eq(business.stores.id, actor.storeId))
    .get();
  return authoriseDemo(result, actor, true);
}

export async function getDemoRecord(services: ApiServices, actor: Actor, authoriseStore = false) {
  ensure(actor.demoId && actor.demoId === actor.tableSessionId, "DEMO_NOT_FOUND", 404);
  const result = authoriseDemo(
    await services.db
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
      .get(),
    actor,
    authoriseStore,
  );
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
    configuration: readConfiguration(JSON.parse(demo.config_json)),
    planId: session.plan_json ? tablePlanSchema.parse(JSON.parse(session.plan_json)).id : null,
    guestCount: session.guest_count,
  };
}
