import type { z } from "zod";
import { and, eq, exists, inArray, sql } from "drizzle-orm";
import type { ApiServices } from "../../../platform/context";
import type { CustomerActor } from "../../customers/model";
import type { customerMemoryInputSchema } from "../model";
import {
  customerMemberships,
  customerMemories,
  customerMemorySources,
} from "../../../db/customer-schema";
import { ensure } from "../../../platform/errors";
import { requireCustomer } from "../../customers/queries";
import {
  customerSessionsScope,
  finishCustomerContextChange,
  resetCustomerContextStatements,
} from "../context";

export async function writeCustomerMemory(
  services: ApiServices,
  actor: CustomerActor,
  input: z.infer<typeof customerMemoryInputSchema>,
) {
  const membership = await requireCustomer(services, actor);
  const now = Date.now();
  const gate = exists(
    services.db
      .select({ id: customerMemberships.id })
      .from(customerMemberships)
      .where(
        and(
          eq(customerMemberships.id, membership.id),
          eq(customerMemberships.active, true),
          eq(customerMemberships.revision, membership.revision),
        ),
      ),
  );
  const write =
    input.revision === 0
      ? services.db
          .insert(customerMemories)
          .select(
            services.db
              .select({
                id: sql<string>`${input.id}`.as("id"),
                storeId: customerMemberships.storeId,
                membershipId: customerMemberships.id,
                sourceId: sql<null | string>`NULL`.as("source_id"),
                sourceKind: sql<"manual">`'manual'`.as("source_kind"),
                content: sql<string>`${input.content}`.as("content"),
                revision: sql<number>`1`.as("revision"),
                edited: sql<boolean>`1`.as("edited"),
                deleted: sql<boolean>`0`.as("deleted"),
                createdAt: sql<number>`${now}`.as("created_at"),
                updatedAt: sql<number>`${now}`.as("updated_at"),
              })
              .from(customerMemberships)
              .where(and(eq(customerMemberships.id, membership.id), gate)),
          )
          .onConflictDoNothing()
      : services.db
          .update(customerMemories)
          .set({
            content: input.content,
            edited: true,
            revision: sql`${customerMemories.revision}+1`,
            updatedAt: now,
          })
          .where(
            and(
              eq(customerMemories.id, input.id),
              eq(customerMemories.membershipId, membership.id),
              eq(customerMemories.storeId, actor.storeId),
              eq(customerMemories.revision, input.revision),
              eq(customerMemories.deleted, false),
              gate,
            ),
          );
  const token = crypto.randomUUID();
  const result = await services.db.batch([
    write,
    ...resetCustomerContextStatements(
      services,
      actor.storeId,
      customerSessionsScope(services, membership.id),
      token,
    ),
  ]);
  ensure(result[0].meta.changes === 1, "CUSTOMER_MEMORY_STALE", 409);
  await finishCustomerContextChange(services, actor.storeId, result[1], result[6]);
  return { saved: true };
}

export async function deleteCustomerMemory(
  services: ApiServices,
  actor: CustomerActor,
  id: string,
  revision: number,
) {
  const membership = await requireCustomer(services, actor);
  const token = crypto.randomUUID();
  const result = await services.db.batch([
    services.db
      .update(customerMemories)
      .set({
        content: "",
        deleted: true,
        revision: sql`${customerMemories.revision}+1`,
        updatedAt: Date.now(),
      })
      .where(
        and(
          eq(customerMemories.id, id),
          eq(customerMemories.membershipId, membership.id),
          eq(customerMemories.storeId, actor.storeId),
          eq(customerMemories.revision, revision),
          eq(customerMemories.deleted, false),
        ),
      ),
    ...resetCustomerContextStatements(
      services,
      actor.storeId,
      customerSessionsScope(services, membership.id),
      token,
    ),
    services.db
      .update(customerMemorySources)
      .set({ content: "" })
      .where(
        and(
          eq(customerMemorySources.membershipId, membership.id),
          eq(customerMemorySources.storeId, actor.storeId),
          inArray(
            customerMemorySources.id,
            services.db
              .select({ id: customerMemories.sourceId })
              .from(customerMemories)
              .where(and(eq(customerMemories.id, id), eq(customerMemories.deleted, true))),
          ),
        ),
      ),
  ]);
  ensure(result[0].meta.changes === 1, "CUSTOMER_MEMORY_STALE", 409);
  await finishCustomerContextChange(services, actor.storeId, result[1], result[6]);
  return { deleted: true };
}
