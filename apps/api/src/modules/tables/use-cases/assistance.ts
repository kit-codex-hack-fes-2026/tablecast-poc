import { and, eq, exists, isNull, notExists, sql } from "drizzle-orm";
import type { ApiServices } from "../../../platform/context";
import type { Actor } from "../../auth/model";
import type { StaffCallInput, StateView } from "../model";
import * as business from "../../../db/business-schema";
import { ensure } from "../../../platform/errors";
import { observeOperation, recordD1Update } from "../../../platform/telemetry";
import { staffCallInputSchema, staffCallSchema, staffHandoffSchema } from "../model";
import { eventStatement, notifyStore, voiceCondition } from "../mutations";
import { getSession } from "../queries";
import { withStateRead } from "../state-read";

async function createStaffCall(
  services: ApiServices,
  actor: Actor,
  view: StateView,
  input: StaffCallInput = {},
) {
  const parsed = staffCallInputSchema.safeParse(input);
  ensure(parsed.success, "INVALID_INPUT", 422);
  const row = await getSession(services, actor);
  ensure(row.status === "open", "SESSION_CLOSED");
  const { idempotencyKey = crypto.randomUUID(), ...suppliedHandoff } = parsed.data;
  const handoff = staffHandoffSchema.parse({
    ...suppliedHandoff,
    locale: suppliedHandoff.locale ?? row.locale,
  });
  const mutation = crypto.randomUUID();
  const call = {
    id: crypto.randomUUID(),
    status: "pending" as const,
    handoff,
    createdAt: Date.now(),
    resolvedAt: null,
  };
  const db = services.db;
  return withStateRead(services, actor, view, async (queries, decode) => {
    if (row.staff_call_json) return decode(await db.batch(queries));
    const [updated, , event, known, ...state] = await db.batch([
      db
        .update(business.tableSessions)
        .set({ staff_called: 1, staff_call_json: JSON.stringify(call), mutation_id: mutation })
        .where(
          and(
            eq(business.tableSessions.id, row.id),
            eq(business.tableSessions.store_id, actor.storeId),
            eq(business.tableSessions.status, "open"),
            isNull(business.tableSessions.staff_call_json),
            notExists(
              db
                .select({ id: business.staffCalls.id })
                .from(business.staffCalls)
                .where(
                  and(
                    eq(business.staffCalls.store_id, actor.storeId),
                    eq(business.staffCalls.table_session_id, row.id),
                    eq(business.staffCalls.idempotency_key, idempotencyKey),
                  ),
                ),
            ),
            sql`1=1${voiceCondition(actor)}`,
          ),
        ),
      db.insert(business.staffCalls).select(
        db
          .select({
            id: sql<string>`${call.id}`.as("id"),
            store_id: business.tableSessions.store_id,
            table_session_id: business.tableSessions.id,
            idempotency_key: sql<string>`${idempotencyKey}`.as("idempotency_key"),
            status: sql<"pending">`'pending'`.as("status"),
            handoff_json: sql<string>`${JSON.stringify(handoff)}`.as("handoff_json"),
            created_at: sql<number>`${call.createdAt}`.as("created_at"),
            resolved_at: sql<null>`NULL`.as("resolved_at"),
          })
          .from(business.tableSessions)
          .where(
            and(
              eq(business.tableSessions.id, row.id),
              eq(business.tableSessions.store_id, actor.storeId),
              eq(business.tableSessions.mutation_id, mutation),
            ),
          ),
      ),
      eventStatement(services, actor, mutation, "staff.called", {
        callId: call.id,
        source: actor.kind,
      }),
      db
        .select({ id: business.staffCalls.id })
        .from(business.staffCalls)
        .where(
          and(
            eq(business.staffCalls.store_id, actor.storeId),
            eq(business.staffCalls.table_session_id, row.id),
            eq(business.staffCalls.idempotency_key, idempotencyKey),
          ),
        )
        .limit(1),
      ...queries,
    ] as const);
    recordD1Update(updated.meta);
    const result = await decode(state);
    ensure(updated.meta.changes === 1 || result.staffCall || known.length > 0, "SESSION_STALE");
    if (updated.meta.changes)
      await notifyStore(services, actor.storeId, row.id, {
        cursor: event.meta.last_row_id,
        demoId: row.kind === "demo" ? row.id : undefined,
      });
    return result;
  });
}

export async function markStaffCallResolved(services: ApiServices, actor: Actor, callId?: string) {
  ensure(actor.kind === "staff", "STAFF_REQUIRED", 403);
  const row = await getSession(services, actor);
  ensure(row.status === "open", "SESSION_STALE", 409);
  const current = row.staff_call_json
    ? staffCallSchema.parse(JSON.parse(row.staff_call_json))
    : null;
  ensure(!callId || current?.id === callId, "STAFF_CALL_STALE", 409);
  const mutation = crypto.randomUUID();
  const now = Date.now();
  const db = services.db;
  const result = await db.batch([
    db
      .update(business.tableSessions)
      .set({ staff_called: 0, staff_call_json: null, mutation_id: mutation })
      .where(
        and(
          eq(business.tableSessions.id, row.id),
          eq(business.tableSessions.store_id, actor.storeId),
          eq(business.tableSessions.status, "open"),
          sql`${business.tableSessions.staff_call_json} IS ${row.staff_call_json}`,
        ),
      ),
    db
      .update(business.staffCalls)
      .set({ status: "resolved", resolved_at: now })
      .where(
        and(
          eq(business.staffCalls.store_id, actor.storeId),
          eq(business.staffCalls.table_session_id, row.id),
          eq(business.staffCalls.id, current?.id ?? ""),
          exists(
            db
              .select({ id: business.tableSessions.id })
              .from(business.tableSessions)
              .where(
                and(
                  eq(business.tableSessions.id, row.id),
                  eq(business.tableSessions.mutation_id, mutation),
                ),
              ),
          ),
        ),
      ),
    eventStatement(services, actor, mutation, "staff.resolved", { callId: current?.id ?? null }),
  ]);
  ensure(result[0].meta.changes === 1, "SESSION_STALE", 409);
  await notifyStore(services, actor.storeId, row.id, {
    cursor: result[2].meta.last_row_id,
    demoId: row.kind === "demo" ? row.id : undefined,
  });
}

export async function showServiceGuidance(
  services: ApiServices,
  actor: Actor,
  selection: { configVersion: number; guideIds: string[]; productIds: string[] },
) {
  const mutation = crypto.randomUUID();
  const [updated, event] = await services.db.batch([
    services.db
      .update(business.tableSessions)
      .set({ mutation_id: mutation })
      .where(
        sql`id=${actor.tableSessionId} AND store_id=${actor.storeId} AND status='open'${voiceCondition(actor)}`,
      ),
    eventStatement(services, actor, mutation, "assistance.shown", {
      ...selection,
      voiceSessionId: actor.voiceSessionId,
      turnId: actor.turnId,
    }),
  ]);
  ensure(updated.meta.changes === 1, "SESSION_STALE");
  await notifyStore(services, actor.storeId, actor.tableSessionId, {
    cursor: event.meta.last_row_id,
    demoId: actor.demoId,
  });
}

export function requestStaffCall(
  services: ApiServices,
  actor: Actor,
  view: StateView,
  input: StaffCallInput = {},
) {
  return observeOperation(
    "tablecast.staff.call",
    () => createStaffCall(services, actor, view, input),
    { env: services.env, input: { actor } },
  );
}
