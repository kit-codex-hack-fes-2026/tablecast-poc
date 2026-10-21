import type { z } from "zod";
import { and, eq } from "drizzle-orm";
import type { ApiServices } from "../../../platform/context";
import type { Actor } from "../../auth/model";
import type { pointCorrectionSchema } from "../model";
import { customerPointEntries } from "../../../db/rewards-schema";
import { ensure } from "../../../platform/errors";
import { pointEntryStatement } from "../mutations";

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
