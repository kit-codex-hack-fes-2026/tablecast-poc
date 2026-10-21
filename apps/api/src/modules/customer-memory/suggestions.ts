import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import {
  customerConsumption,
  customerMemberships,
  customerVisitParticipants,
} from "../../db/customer-schema";
import { orders, tableSessions } from "../../db/table-schema";
import { ensure } from "../../platform/errors";
import { getCatalog } from "../catalog/queries";
import { snapshotSchema } from "../orders/model";
import { customerReadGate, customerReadProof, customerServiceTarget } from "./queries";

export async function customerSuggestions(
  services: ApiServices,
  actor: Actor,
  input: { kind: "companions" | "untried" | "usual"; offset: number },
) {
  const snapshot = await customerServiceTarget(services, actor);
  const { session, participants, target } = snapshot;
  const gate = customerReadGate(services, actor, snapshot);
  if (input.kind !== "companions" && (!target || !target.membership.useMemories))
    return { needsTarget: !target, products: [], more: false };
  const catalog = await getCatalog(services, actor.storeId);
  let counts = new Map<string, number>();
  if (input.kind === "companions") {
    if (!participants.length) return { needsTarget: false, products: [], more: false };
    const ids = participants.map((p) => p.membership.id);
    // 同行共有と来店中利用を全員が許可した同じ構成の来店だけを読む。
    const permitted = await services.db
      .select({ id: customerMemberships.id })
      .from(customerMemberships)
      .where(
        and(
          inArray(customerMemberships.id, ids),
          eq(customerMemberships.storeId, actor.storeId),
          eq(customerMemberships.active, true),
          eq(customerMemberships.useMemories, true),
          eq(customerMemberships.shareCompanions, true),
        ),
      );
    if (permitted.length !== ids.length) return { needsTarget: false, products: [], more: false };
    const groups = services.db
      .select({ id: customerVisitParticipants.sessionId })
      .from(customerVisitParticipants)
      .where(
        and(
          eq(customerVisitParticipants.storeId, actor.storeId),
          ne(customerVisitParticipants.sessionId, session.id),
        ),
      )
      .groupBy(customerVisitParticipants.sessionId)
      .having(
        sql`count(*)=${ids.length} AND sum(CASE WHEN ${inArray(customerVisitParticipants.membershipId, ids)} THEN 1 ELSE 0 END)=${ids.length}`,
      );
    const past = await services.db
      .select({ id: tableSessions.id })
      .from(tableSessions)
      .where(
        and(
          eq(tableSessions.store_id, actor.storeId),
          eq(tableSessions.status, "closed"),
          inArray(tableSessions.id, groups),
        ),
      )
      .orderBy(desc(tableSessions.closed_at))
      .limit(1)
      .get();
    if (!past) return { needsTarget: false, products: [], more: false };
    const [valid, shared] = await services.db.batch([
      customerReadProof(services, gate),
      services.db
        .select({ snapshot: orders.snapshot_json })
        .from(orders)
        .where(
          and(
            eq(orders.store_id, actor.storeId),
            eq(orders.table_session_id, past.id),
            inArray(orders.status, ["accepted", "served"]),
            gate,
          ),
        ),
    ]);
    ensure(valid.length === 1, "CUSTOMER_CONTEXT_STALE", 409);
    for (const order of shared)
      for (const line of snapshotSchema.parse(JSON.parse(order.snapshot)).lines)
        counts.set(line.productId, (counts.get(line.productId) ?? 0) + line.quantity);
  } else {
    ensure(target, "CUSTOMER_TARGET_REQUIRED", 422);
    const [valid, rows] = await services.db.batch([
      customerReadProof(services, gate),
      services.db
        .select({
          productId: customerConsumption.productId,
          quantity: sql<number>`sum(${customerConsumption.quantity})`.mapWith(Number),
        })
        .from(customerConsumption)
        .innerJoin(
          orders,
          and(eq(orders.id, customerConsumption.orderId), eq(orders.store_id, actor.storeId)),
        )
        .where(
          and(
            eq(customerConsumption.storeId, actor.storeId),
            eq(customerConsumption.membershipId, target.membership.id),
            gate,
            sql`${customerConsumption.productId} IN (SELECT value FROM json_each(${JSON.stringify(catalog.configuration.products.map((p) => p.id))}))`,
          ),
        )
        .groupBy(customerConsumption.productId),
    ]);
    ensure(valid.length === 1, "CUSTOMER_CONTEXT_STALE", 409);
    counts = new Map(rows.map((row) => [row.productId, row.quantity]));
  }
  const candidates = catalog.configuration.products
    .filter(
      (p) =>
        p.available &&
        (input.kind === "untried" ? !(counts.get(p.id) ?? 0) : (counts.get(p.id) ?? 0) > 0),
    )
    .toSorted((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
  return {
    needsTarget: false,
    version: catalog.version,
    products: candidates.slice(input.offset, input.offset + 8).map((p) => ({
      id: p.id,
      name: p.text[session.locale].displayName,
      price: p.price,
      previousQuantity: counts.get(p.id) ?? 0,
    })),
    more: input.offset + 8 < candidates.length,
    nextOffset: input.offset + 8,
    requiresCurrentOptions: true,
  };
}
