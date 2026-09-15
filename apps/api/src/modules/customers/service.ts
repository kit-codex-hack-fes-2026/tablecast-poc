import { and, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import { customerMemberships } from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import {
  customerConsentVersion,
  type CustomerActor,
  type customerPreferencesSchema,
} from "./model";
import { getCustomerStore } from "./queries";

export async function enrolCustomer(services: ApiServices, actor: CustomerActor) {
  await getCustomerStore(services, actor);
  const now = Date.now();
  await services.db
    .insert(customerMemberships)
    .values({
      id: crypto.randomUUID(),
      storeId: actor.storeId,
      userId: actor.userId,
      active: true,
      shareCompanions: true,
      useMemories: true,
      saveMemories: true,
      consentVersion: customerConsentVersion,
      joinedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [customerMemberships.storeId, customerMemberships.userId],
      set: {
        active: true,
        shareCompanions: true,
        useMemories: true,
        saveMemories: true,
        consentVersion: customerConsentVersion,
        revision: sql`${customerMemberships.revision} + 1`,
        updatedAt: now,
      },
      // 入会の再送で、後から撤回した同意を復活させない。
      setWhere: eq(customerMemberships.active, false),
    });
  return getCustomerStore(services, actor);
}

export async function updateCustomerPreferences(
  services: ApiServices,
  actor: CustomerActor,
  input: z.infer<typeof customerPreferencesSchema>,
) {
  const result = await services.db
    .update(customerMemberships)
    .set({
      shareCompanions: input.shareCompanions,
      useMemories: input.useMemories,
      saveMemories: input.saveMemories,
      revision: sql`${customerMemberships.revision} + 1`,
      updatedAt: Date.now(),
    })
    .where(
      and(
        eq(customerMemberships.storeId, actor.storeId),
        eq(customerMemberships.userId, actor.userId),
        eq(customerMemberships.active, true),
        eq(customerMemberships.revision, input.revision),
      ),
    )
    .returning({ id: customerMemberships.id });
  ensure(result.length === 1, "CUSTOMER_MEMBERSHIP_STALE", 409);
  return getCustomerStore(services, actor);
}

export async function leaveCustomerMembership(
  services: ApiServices,
  actor: CustomerActor,
  revision: number,
) {
  const result = await services.db
    .update(customerMemberships)
    .set({
      active: false,
      shareCompanions: false,
      useMemories: false,
      saveMemories: false,
      revision: sql`${customerMemberships.revision} + 1`,
      updatedAt: Date.now(),
    })
    .where(
      and(
        eq(customerMemberships.storeId, actor.storeId),
        eq(customerMemberships.userId, actor.userId),
        eq(customerMemberships.active, true),
        eq(customerMemberships.revision, revision),
      ),
    )
    .returning({ id: customerMemberships.id });
  ensure(result.length === 1, "CUSTOMER_MEMBERSHIP_STALE", 409);
  return { left: true };
}
