import { issueEligibleCoupons } from "../customer-coupons/issuance";
import { and, eq, exists, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import {
  customerMemberships,
  customerPointAllocations,
  customerPointEntries,
  customerPointPolicies,
  customerPointVisits,
  stores,
  tableSessions,
} from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import type { Actor } from "../auth/model";
import { requireManager } from "../auth/policy";
import { eventStatement, notifyStore } from "../tables/mutations";
import { getTableState } from "../tables/queries";
import { getPointPolicy, getPointVisit } from "./queries";
import {
  noPointRules,
  pointRulesSchema,
  type confirmPointsSchema,
  type pointCorrectionSchema,
  type pointPolicySchema,
} from "./model";
export function snapshotPointPolicy(services: ApiServices, storeId: string, sessionId: string) {
  const latest = services.db
    .select({ rules: customerPointPolicies.rulesJson })
    .from(customerPointPolicies)
    .where(eq(customerPointPolicies.storeId, storeId))
    .orderBy(sql`${customerPointPolicies.version} DESC`)
    .limit(1);
  return services.db.insert(customerPointVisits).select(
    services.db
      .select({
        sessionId: tableSessions.id,
        storeId: tableSessions.store_id,
        rulesJson: sql<string>`coalesce((${latest}),${JSON.stringify(noPointRules)})`.as(
          "rules_json",
        ),
        confirmedAt: sql<number | null>`NULL`.as("confirmed_at"),
        confirmedBy: sql<string | null>`NULL`.as("confirmed_by"),
        idempotencyKey: sql<string | null>`NULL`.as("idempotency_key"),
        recipientsJson: sql<string>`'[]'`.as("recipients_json"),
        mutationId: sql<string | null>`NULL`.as("mutation_id"),
      })
      .from(tableSessions)
      .where(
        and(eq(tableSessions.id, sessionId), eq(tableSessions.store_id, storeId), sql`changes()=1`),
      ),
  );
}
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
export function pointEntryStatement(
  services: ApiServices,
  actor: Pick<Actor, "storeId" | "userId">,
  membershipId: string,
  delta: number,
  kind: "award" | "exchange" | "correction",
  reference: string,
  reason: string,
  gate: SQL | undefined,
) {
  return services.db
    .insert(customerPointEntries)
    .select(
      services.db
        .select({
          id: sql<string>`${[Date.now().toString().padStart(16, "0"), crypto.randomUUID()].join(":")}`.as(
            "id",
          ),
          storeId: customerMemberships.storeId,
          membershipId: customerMemberships.id,
          delta: sql<number>`${delta}`.as("delta"),
          kind: sql<"award" | "exchange" | "correction">`${kind}`.as("kind"),
          reference: sql<string>`${reference}`.as("reference"),
          reason: sql<string>`${reason}`.as("reason"),
          createdBy: sql<string>`${actor.userId ?? "system"}`.as("created_by"),
          createdAt: sql<number>`${Date.now()}`.as("created_at"),
        })
        .from(customerMemberships)
        .where(
          and(
            eq(customerMemberships.storeId, actor.storeId),
            eq(customerMemberships.id, membershipId),
            gate,
          ),
        ),
    )
    .onConflictDoNothing();
}
function calculateAllocation(
  total: number,
  count: number,
  position: number,
  rules: z.infer<typeof pointRulesSchema>,
) {
  const amount = count ? Math.floor(total / count) + (position < total % count ? 1 : 0) : 0;
  return {
    amount,
    points: rules.enabled
      ? rules.kind === "visit"
        ? rules.points
        : Math.floor(amount / rules.unitYen) * rules.points
      : 0,
  };
}
export async function confirmCustomerPoints(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof confirmPointsSchema>,
) {
  ensure(actor.kind === "staff" && actor.userId, "STAFF_REQUIRED", 403);
  // 移行前・fixture由来の来店へ現在の規則を遡及適用しない。
  await services.db
    .insert(customerPointVisits)
    .select(
      services.db
        .select({
          sessionId: tableSessions.id,
          storeId: tableSessions.store_id,
          rulesJson: sql<string>`${JSON.stringify(noPointRules)}`.as("rules_json"),
          confirmedAt: sql<number | null>`NULL`.as("confirmed_at"),
          confirmedBy: sql<string | null>`NULL`.as("confirmed_by"),
          idempotencyKey: sql<string | null>`NULL`.as("idempotency_key"),
          recipientsJson: sql<string>`'[]'`.as("recipients_json"),
          mutationId: sql<string | null>`NULL`.as("mutation_id"),
        })
        .from(tableSessions)
        .where(
          and(
            eq(tableSessions.id, actor.tableSessionId ?? ""),
            eq(tableSessions.store_id, actor.storeId),
          ),
        ),
    )
    .onConflictDoNothing();
  const visit = await getPointVisit(services, actor);
  const selectedIds = new Set(input.participantIds);
  const recipients = visit.participants.filter((p) => selectedIds.has(p.id));
  ensure(
    recipients.length === selectedIds.size && recipients.every((p) => p.active),
    "POINT_RECIPIENT_INVALID",
    422,
  );
  const recipientJson = JSON.stringify(recipients.map((p) => p.id));
  if (visit.confirmedAt !== null) {
    const existing = await services.db
      .select({ recipients: customerPointVisits.recipientsJson })
      .from(customerPointVisits)
      .where(
        and(
          eq(customerPointVisits.sessionId, visit.sessionId),
          eq(customerPointVisits.storeId, actor.storeId),
        ),
      )
      .get();
    ensure(
      visit.idempotencyKey === input.idempotencyKey && existing?.recipients === recipientJson,
      "POINT_VISIT_ALREADY_CONFIRMED",
      409,
    );
    await issueEligibleCoupons(
      services,
      actor.storeId,
      visit.allocations.map((allocation) => allocation.membershipId),
      "visit",
    );
    return visit;
  }
  const table = await getTableState(services, actor);
  ensure(
    table.bill.due === 0 &&
      table.cart.lines.length === 0 &&
      table.orders.every((order) => ["served", "cancelled", "rejected"].includes(order.status)),
    "TABLE_NOT_SETTLED",
    409,
  );
  const total = table.bill.orderedTotal + table.bill.adjustmentTotal + table.bill.planTotal;
  ensure(total >= 0, "POINT_AMOUNT_INVALID", 422);
  const token = crypto.randomUUID();
  const now = Date.now();
  const changed = exists(
    services.db
      .select({ id: tableSessions.id })
      .from(tableSessions)
      .where(
        and(
          eq(tableSessions.id, visit.sessionId),
          eq(tableSessions.store_id, actor.storeId),
          eq(tableSessions.mutation_id, token),
        ),
      ),
  );
  const validRecipients = services.db
    .select({ count: sql<number>`count(*)` })
    .from(customerMemberships)
    .where(
      and(
        eq(customerMemberships.storeId, actor.storeId),
        inArray(
          customerMemberships.id,
          recipients.map((p) => p.membershipId),
        ),
        eq(customerMemberships.active, true),
      ),
    );
  const operations = recipients.flatMap((recipient, position) => {
    const allocation = calculateAllocation(total, recipients.length, position, visit.rules);
    return [
      services.db.insert(customerPointAllocations).select(
        services.db
          .select({
            sessionId: tableSessions.id,
            membershipId: sql<string>`${recipient.membershipId}`.as("membership_id"),
            storeId: tableSessions.store_id,
            position: sql<number>`${position}`.as("position"),
            amount: sql<number>`${allocation.amount}`.as("amount"),
            points: sql<number>`${allocation.points}`.as("points"),
          })
          .from(tableSessions)
          .where(and(eq(tableSessions.id, visit.sessionId), changed)),
      ),
      pointEntryStatement(
        services,
        actor,
        recipient.membershipId,
        allocation.points,
        "award",
        `visit:${visit.sessionId}`,
        "来店実績の確認 / Verified visit",
        changed,
      ),
    ];
  });
  const result = await services.db.batch([
    services.db
      .update(customerPointVisits)
      .set({
        confirmedAt: now,
        confirmedBy: actor.userId,
        idempotencyKey: input.idempotencyKey,
        recipientsJson: recipientJson,
        mutationId: token,
      })
      .where(
        and(
          eq(customerPointVisits.sessionId, visit.sessionId),
          eq(customerPointVisits.storeId, actor.storeId),
          isNull(customerPointVisits.confirmedAt),
          sql`(${validRecipients})=${recipients.length}`,
          exists(
            services.db
              .select({ id: tableSessions.id })
              .from(tableSessions)
              .where(
                and(
                  eq(tableSessions.id, visit.sessionId),
                  eq(tableSessions.store_id, actor.storeId),
                  eq(tableSessions.cart_version, input.expectedVersion),
                ),
              ),
          ),
        ),
      ),
    services.db
      .update(tableSessions)
      .set({ cart_version: sql`${tableSessions.cart_version}+1`, mutation_id: token })
      .where(
        and(
          eq(tableSessions.id, visit.sessionId),
          eq(tableSessions.store_id, actor.storeId),
          exists(
            services.db
              .select({ id: customerPointVisits.sessionId })
              .from(customerPointVisits)
              .where(
                and(
                  eq(customerPointVisits.sessionId, visit.sessionId),
                  eq(customerPointVisits.mutationId, token),
                ),
              ),
          ),
        ),
      ),
    ...operations,
    eventStatement(
      services,
      { ...actor, tableSessionId: visit.sessionId },
      token,
      "customer.points-confirmed",
      {},
    ),
  ]);
  if (result[0].meta.changes !== 1) {
    const current = await getPointVisit(services, actor);
    ensure(
      current.idempotencyKey === input.idempotencyKey &&
        JSON.stringify(current.allocations.map((allocation) => allocation.membershipId)) ===
          JSON.stringify(recipients.map((recipient) => recipient.membershipId)),
      "POINT_VISIT_STALE",
      409,
    );
    await issueEligibleCoupons(
      services,
      actor.storeId,
      current.allocations.map((allocation) => allocation.membershipId),
      "visit",
    );
    return current;
  }
  await issueEligibleCoupons(
    services,
    actor.storeId,
    recipients.map((recipient) => recipient.membershipId),
    "visit",
  );
  await notifyStore(services, actor.storeId, visit.sessionId);
  return getPointVisit(services, actor);
}
export async function pointBillingCorrectionStatements(
  services: ApiServices,
  actor: Actor,
  amount: number,
  reference: string,
  mutation: string,
) {
  const [visits, allocations] = await services.db.batch([
    services.db
      .select()
      .from(customerPointVisits)
      .where(
        and(
          eq(customerPointVisits.sessionId, actor.tableSessionId ?? ""),
          eq(customerPointVisits.storeId, actor.storeId),
        ),
      ),
    services.db
      .select()
      .from(customerPointAllocations)
      .where(
        and(
          eq(customerPointAllocations.sessionId, actor.tableSessionId ?? ""),
          eq(customerPointAllocations.storeId, actor.storeId),
        ),
      ),
  ]);
  const visit = visits[0];
  if (!visit?.confirmedAt) return [];
  const rules = pointRulesSchema.parse(JSON.parse(visit.rulesJson));
  const gate = exists(
    services.db
      .select({ id: tableSessions.id })
      .from(tableSessions)
      .where(
        and(
          eq(tableSessions.id, visit.sessionId),
          eq(tableSessions.store_id, actor.storeId),
          eq(tableSessions.mutation_id, mutation),
        ),
      ),
  );
  return allocations.flatMap((allocation) => {
    const next = calculateAllocation(amount, allocations.length, allocation.position, rules);
    return [
      pointEntryStatement(
        services,
        actor,
        allocation.membershipId,
        next.points - allocation.points,
        "correction",
        `billing:${visit.sessionId}:${reference}`,
        "会計訂正による差分 / Bill correction",
        gate,
      ),
      services.db
        .update(customerPointAllocations)
        .set(next)
        .where(
          and(
            eq(customerPointAllocations.sessionId, visit.sessionId),
            eq(customerPointAllocations.membershipId, allocation.membershipId),
            eq(customerPointAllocations.storeId, actor.storeId),
            gate,
          ),
        ),
    ];
  });
}
export async function correctCustomerPoints(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof pointCorrectionSchema>,
) {
  ensure(actor.kind === "staff" && actor.userId, "STAFF_REQUIRED", 403);
  const reference = `manual:${input.idempotencyKey}`;
  const existing = await services.db
    .select()
    .from(customerPointEntries)
    .where(
      and(
        eq(customerPointEntries.storeId, actor.storeId),
        eq(customerPointEntries.membershipId, input.membershipId),
        eq(customerPointEntries.reference, reference),
      ),
    )
    .get();
  if (existing) {
    ensure(
      existing.delta === input.delta && existing.reason === input.reason,
      "IDEMPOTENCY_CONFLICT",
      409,
    );
    return { recorded: true };
  }
  const result = await pointEntryStatement(
    services,
    actor,
    input.membershipId,
    input.delta,
    "correction",
    reference,
    input.reason,
    undefined,
  );
  ensure(result.meta.changes === 1, "POINT_CORRECTION_CONFLICT", 409);
  return { recorded: true };
}
