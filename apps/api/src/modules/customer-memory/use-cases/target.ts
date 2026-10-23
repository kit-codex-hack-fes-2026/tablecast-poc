import type { z } from "zod";
import { and, eq, exists } from "drizzle-orm";
import type { ApiServices } from "../../../platform/context";
import type { Actor } from "../../auth/model";
import type { customerTargetSchema } from "../model";
import { customerContexts } from "../../../db/customer-schema";
import { tableSessions } from "../../../db/table-schema";
import { ensure } from "../../../platform/errors";
import { finishCustomerContextChange, resetCustomerContextStatements } from "../context";
import { customerServiceTarget } from "../queries";

export async function selectCustomerTarget(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof customerTargetSchema>,
) {
  ensure(actor.kind === "device", "DEVICE_REQUIRED", 403);
  const { context, session, participants } = await customerServiceTarget(services, actor);
  ensure(context?.token === input.token, "CUSTOMER_CONTEXT_STALE", 409);
  ensure(
    input.participantId === null ||
      participants.some((p) => p.participant.id === input.participantId),
    "CUSTOMER_TARGET_REQUIRED",
    422,
  );
  const token = crypto.randomUUID();
  const result = await services.db.batch([
    services.db
      .update(customerContexts)
      .set({ selectedParticipantId: input.participantId })
      .where(
        and(
          eq(customerContexts.sessionId, session.id),
          eq(customerContexts.storeId, actor.storeId),
          eq(customerContexts.token, input.token),
          exists(
            services.db
              .select({ id: tableSessions.id })
              .from(tableSessions)
              .where(and(eq(tableSessions.id, session.id), eq(tableSessions.status, "open"))),
          ),
        ),
      ),
    ...resetCustomerContextStatements(
      services,
      actor.storeId,
      eq(tableSessions.id, session.id),
      token,
      input.participantId,
    ),
  ]);
  ensure(result[0].meta.changes === 1, "CUSTOMER_CONTEXT_STALE", 409);
  await finishCustomerContextChange(services, actor.storeId, result[1], result[6]);
  return { token, selectedParticipantId: input.participantId };
}
