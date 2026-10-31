import { and, eq, exists, inArray, isNull, sql } from "drizzle-orm";
import type { ApiServices } from "../../../platform/context";
import type { CustomerActor } from "../../customers/model";
import { customerMemberships, customerVisitParticipants } from "../../../db/customer-schema";
import { customerCoupons } from "../../../db/rewards-schema";
import { tableSessions } from "../../../db/table-schema";
import { ensure } from "../../../platform/errors";
import { requireCustomerVisit } from "../../customer-visits/queries";
import { couponEvent } from "../mutations";

export async function requestCustomerCoupon(
  services: ApiServices,
  actor: CustomerActor,
  couponId: string,
  sessionId: string,
) {
  const visit = await requireCustomerVisit(services, actor, sessionId);
  ensure(
    visit.session.status === "open" && visit.participation.leftAt === null,
    "CUSTOMER_NOT_CONNECTED",
    409,
  );
  const token = crypto.randomUUID();
  const now = Date.now();
  const rows = await services.db.batch([
    services.db
      .update(customerCoupons)
      .set({ state: "requested", requestedSessionId: sessionId, mutationId: token })
      .where(
        and(
          eq(customerCoupons.id, couponId),
          eq(customerCoupons.storeId, actor.storeId),
          eq(customerCoupons.membershipId, visit.membership.id),
          exists(
            services.db
              .select({ id: customerVisitParticipants.id })
              .from(customerVisitParticipants)
              .where(
                and(
                  eq(customerVisitParticipants.membershipId, visit.membership.id),
                  eq(customerVisitParticipants.sessionId, sessionId),
                  isNull(customerVisitParticipants.leftAt),
                ),
              ),
          ),
          inArray(customerCoupons.state, ["available", "requested"]),
          sql`json_extract(${customerCoupons.snapshotJson},'$.startsAt')<=${now}`,
          sql`json_extract(${customerCoupons.snapshotJson},'$.endsAt')>${now}`,
          exists(
            services.db
              .select({ id: tableSessions.id })
              .from(tableSessions)
              .where(and(eq(tableSessions.id, sessionId), eq(tableSessions.status, "open"))),
          ),
          exists(
            services.db
              .select({ id: customerMemberships.id })
              .from(customerMemberships)
              .where(
                and(
                  eq(customerMemberships.id, visit.membership.id),
                  eq(customerMemberships.active, true),
                ),
              ),
          ),
        ),
      )
      .returning({ id: customerCoupons.id }),
    couponEvent(services, actor.storeId, token, "requested", "", actor.userId),
  ]);
  ensure(rows[0].length === 1, "COUPON_UNAVAILABLE", 409);
  return { requested: true };
}
