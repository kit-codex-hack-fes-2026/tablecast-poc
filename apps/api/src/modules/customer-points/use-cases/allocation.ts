import type { z } from "zod";
import { and, eq, exists, inArray, isNull, sql } from "drizzle-orm";
import type { ApiServices } from "../../../platform/context";
import type { Actor } from "../../auth/model";
import { customerMemberships } from "../../../db/customer-schema";
import {
  customerPointAllocations,
  customerPointEntries,
  customerPointVisits,
} from "../../../db/rewards-schema";
import { tableSessions } from "../../../db/table-schema";
import { ensure } from "../../../platform/errors";
import { confirmedVisitCouponStatements } from "../../customer-coupons/issuance";
import { eventStatement, mutationGate, notifyStore } from "../../tables/mutations";
import { getTableState } from "../../tables/queries";
import { type confirmPointsSchema, noPointRules, type pointCorrectionSchema } from "../model";
import { calculateAllocation, pointEntryStatement } from "../mutations";
import { getPointVisit } from "../queries";

export async function confirmCustomerPoints(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof confirmPointsSchema>,
) {
  ensure(actor.kind === "staff" && actor.userId, "STAFF_REQUIRED", 403);
  // 移行前・fixture由来の来店へ現在の規則を遡及適用しない。
  const legacyVisit = services.db
    .insert(customerPointVisits)
    .select(
      services.db
        .select({
          sessionId: tableSessions.id,
          storeId: tableSessions.store_id,
          rulesJson: sql<string>`${JSON.stringify(noPointRules)}`.as("rules_json"),
          confirmedAt: sql<null | number>`NULL`.as("confirmed_at"),
          confirmedBy: sql<null | string>`NULL`.as("confirmed_by"),
          idempotencyKey: sql<null | string>`NULL`.as("idempotency_key"),
          recipientsJson: sql<string>`'[]'`.as("recipients_json"),
          mutationId: sql<null | string>`NULL`.as("mutation_id"),
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
    await services.db.batch(
      confirmedVisitCouponStatements(services, actor.storeId, visit.sessionId),
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
  const changed = mutationGate(services, actor, token);
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
    legacyVisit,
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
    ...confirmedVisitCouponStatements(services, actor.storeId, visit.sessionId, changed),
    eventStatement(
      services,
      { ...actor, tableSessionId: visit.sessionId },
      token,
      "customer.points-confirmed",
      {},
    ),
  ]);
  if (result[1].meta.changes !== 1) {
    const current = await getPointVisit(services, actor);
    ensure(
      current.idempotencyKey === input.idempotencyKey &&
        JSON.stringify(current.allocations.map((allocation) => allocation.membershipId)) ===
          JSON.stringify(recipients.map((recipient) => recipient.membershipId)),
      "POINT_VISIT_STALE",
      409,
    );
    await services.db.batch(
      confirmedVisitCouponStatements(services, actor.storeId, current.sessionId),
    );
    return current;
  }
  await notifyStore(services, actor.storeId, visit.sessionId);
  return getPointVisit(services, actor);
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
