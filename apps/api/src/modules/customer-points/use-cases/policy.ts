import type { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import type { ApiServices } from "../../../platform/context";
import type { Actor } from "../../auth/model";
import { customerPointPolicies } from "../../../db/rewards-schema";
import { stores } from "../../../db/table-schema";
import { ensure } from "../../../platform/errors";
import { requireManager } from "../../auth/policy";
import { type pointPolicySchema } from "../model";
import { getPointPolicy } from "../queries";

export async function setPointPolicy(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof pointPolicySchema>,
) {
  requireManager(actor);
  const { expectedVersion, ...rules } = input;
  const latest = services.db
    .select({ version: sql<number>`coalesce(max(${customerPointPolicies.version}),0)` })
    .from(customerPointPolicies)
    .where(eq(customerPointPolicies.storeId, actor.storeId));
  const result = await services.db
    .insert(customerPointPolicies)
    .select(
      services.db
        .select({
          storeId: stores.id,
          version: sql<number>`${expectedVersion + 1}`.as("version"),
          rulesJson: sql<string>`${JSON.stringify(rules)}`.as("rules_json"),
          createdAt: sql<number>`${Date.now()}`.as("created_at"),
          createdBy: sql<string>`${actor.userId ?? "mcp"}`.as("created_by"),
        })
        .from(stores)
        .where(and(eq(stores.id, actor.storeId), sql`(${latest})=${expectedVersion}`)),
    )
    .onConflictDoNothing()
    .returning({ version: customerPointPolicies.version });
  ensure(result.length === 1, "POINT_POLICY_STALE", 409);
  return getPointPolicy(services, actor);
}
