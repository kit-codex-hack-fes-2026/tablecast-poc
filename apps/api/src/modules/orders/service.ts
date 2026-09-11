import { measured, observeOperation } from "../../platform/telemetry";
import { sql } from "drizzle-orm";
import * as business from "../../db/business-schema";
import type { ConfirmationRecord, OrderRecord } from "../../db/records";
import type { ApiServices } from "../../platform/context";
import { DomainError, ensure } from "../../platform/errors";
import type { Actor } from "../auth/model";
import { confirmationText, priceCart } from "../catalog/pricing";
import { getCatalog, sessionConfigVersion } from "../catalog/queries";
import type { TableState } from "../tables/model";
import {
  eventStatement,
  invalidationStatement,
  notifyStore,
  voiceCondition,
} from "../tables/mutations";
import { getSession, getTableState, orderValue, planContext } from "../tables/queries";
import {
  cartLineSchema,
  snapshotSchema,
  type CartUpdate,
  type Order,
  type Snapshot,
} from "./model";
export async function updateCart(
  services: ApiServices,
  actor: Actor,
  input: CartUpdate,
): Promise<TableState> {
  return observeOperation(
    "tablecast.cart.update",
    async () => {
      const db = services.db;

      const session = await getSession(services, actor);
      ensure(session.status === "open", "SESSION_CLOSED");
      const catalog = await getCatalog(services, actor.storeId, actor.demoId);
      priceCart(
        catalog.configuration,
        input.lines,
        input.expectedVersion,
        await planContext(services, session),
      );
      const mutation = crypto.randomUUID();
      const gate = voiceCondition(actor);
      const result = await db.batch([
        db
          .update(business.tableSessions)
          .set({
            cart_json: JSON.stringify(input.lines),
            cart_version: sql`cart_version+1`,
            mutation_id: mutation,
          })
          .where(
            sql`id=${session.id} AND store_id=${actor.storeId} AND status='open' AND cart_version=${input.expectedVersion} AND ${sessionConfigVersion(actor.storeId, actor.tableSessionId)}=${catalog.version}${gate}`,
          ),
        invalidationStatement(services, actor, mutation),
        eventStatement(services, actor, mutation, "cart.updated", {
          version: input.expectedVersion + 1,
          source: actor.kind,
        }),
      ]);
      ensure(result[0]?.meta.changes === 1, "CART_CONFLICT");
      await notifyStore(services, actor.storeId, actor.tableSessionId);
      return getTableState(services, actor);
    },
    { env: services.env, input: { actor, input } },
  );
}

export async function prepareConfirmation(
  services: ApiServices,
  actor: Actor,
  input: { expectedVersion: number; channel: "gui" | "voice" },
): Promise<Snapshot> {
  return observeOperation(
    "tablecast.order.confirmation",
    async () => {
      const db = services.db;

      const session = await getSession(services, actor);
      ensure(session.status === "open", "SESSION_CLOSED");
      ensure(
        input.channel === "gui"
          ? actor.kind === "device" || actor.kind === "staff"
          : actor.kind === "voice" && actor.turnId,
        "CONFIRMATION_CHANNEL",
        403,
      );
      const catalog = await getCatalog(services, actor.storeId, actor.demoId);
      const plan = await planContext(services, session);
      const cart = priceCart(
        catalog.configuration,
        cartLineSchema.array().parse(JSON.parse(session.cart_json)),
        session.cart_version,
        plan,
      );
      ensure(cart.complete, "CART_INCOMPLETE", 422);
      const now = Date.now();
      const mutation = crypto.randomUUID();
      const gate = voiceCondition(actor);
      const snapshotPlan = plan
        ? {
            id: plan.id,
            name: { ja: plan.rules.text.ja.displayName, en: plan.rules.text.en.displayName },
          }
        : null;
      const snapshot: Snapshot = {
        id: crypto.randomUUID(),
        tableSessionId: session.id,
        cartVersion: session.cart_version,
        configVersion: catalog.version,
        lines: cart.lines,
        total: cart.total,
        locale: session.locale,
        text: confirmationText(cart.lines, cart.total, session.locale, snapshotPlan),
        expiresAt:
          plan && cart.lines.some((line) => line.planCovered)
            ? Math.min(
                now + 120000,
                plan.startedAt +
                  (plan.rules.durationMinutes - plan.rules.lastOrderMinutesBeforeEnd) * 60000,
              )
            : now + 120000,
        channel: input.channel,
        status: "pending",
        createdTurnId: actor.turnId ?? null,
        plan: snapshotPlan,
      };
      const result = await db.batch([
        db
          .update(business.tableSessions)
          .set({ mutation_id: mutation })
          .where(
            sql`id=${session.id} AND store_id=${actor.storeId} AND status='open' AND cart_version=${input.expectedVersion} AND ${sessionConfigVersion(actor.storeId, actor.tableSessionId)}=${catalog.version}${gate}`,
          ),
        invalidationStatement(services, actor, mutation),
        db
          .insert(business.confirmations)
          .select(
            sql`SELECT ${snapshot.id},store_id,id,${snapshot.cartVersion},${snapshot.configVersion},${snapshot.channel},${actor.voiceSessionId ?? null},${actor.turnId ?? null},NULL,'pending',${JSON.stringify(snapshot)},${snapshot.expiresAt},${now} FROM table_sessions WHERE id=${session.id} AND mutation_id=${mutation}`,
          ),
        eventStatement(services, actor, mutation, "confirmation.prepared", {
          snapshotId: snapshot.id,
          channel: snapshot.channel,
        }),
      ]);
      ensure(result[0]?.meta.changes === 1, "CART_CONFLICT");
      await notifyStore(services, actor.storeId, actor.tableSessionId);
      return snapshot;
    },
    { env: services.env, input: { actor, input } },
  );
}

export async function getVoiceConfirmation(
  services: ApiServices,
  actor: Actor,
): Promise<Snapshot | null> {
  const db = services.db;

  await getSession(services, actor);
  const row = await db.get<ConfirmationRecord | undefined>(
    sql`SELECT * FROM confirmations WHERE table_session_id=${actor.tableSessionId} AND voice_session_id=${actor.voiceSessionId} AND status='pending' AND expires_at>${Date.now()} AND created_turn_id=${actor.turnId} ORDER BY created_at DESC LIMIT 1`,
  );
  return row ? snapshotSchema.parse(JSON.parse(row.snapshot_json)) : null;
}

export async function markConfirmationRead(services: ApiServices, actor: Actor, id: string) {
  const db = services.db;

  await getSession(services, actor);
  ensure(actor.kind === "voice", "VOICE_ONLY", 403);
  const result = await db
    .update(business.confirmations)
    .set({ status: "read", read_at: Date.now() })
    .where(
      sql`id=${id} AND table_session_id=${actor.tableSessionId} AND voice_session_id=${actor.voiceSessionId} AND status='pending' AND expires_at>${Date.now()} AND created_turn_id=${actor.turnId} AND EXISTS(SELECT 1 FROM table_sessions WHERE id=${actor.tableSessionId} AND store_id=confirmations.store_id AND status='open' AND voice_state='active' AND voice_session_id=${actor.voiceSessionId} AND active_turn_id=${actor.turnId} AND cart_version=confirmations.cart_version) AND config_version=${sessionConfigVersion(actor.storeId, actor.tableSessionId)}`,
    );
  ensure(result.meta.changes === 1, "CONFIRMATION_STALE");
}

export async function submitOrder(
  services: ApiServices,
  actor: Actor,
  input: { snapshotId: string; idempotencyKey: string; approved: true },
): Promise<Order> {
  return observeOperation(
    "tablecast.order.submit",
    async () => {
      const db = services.db;

      ensure(input.approved, "APPROVAL_REQUIRED", 422);
      await measured("tablecast.order.session", () => getSession(services, actor));
      const existing = await db.get<OrderRecord | undefined>(
        sql`SELECT * FROM orders WHERE table_session_id=${actor.tableSessionId} AND store_id=${actor.storeId} AND idempotency_key=${input.idempotencyKey}`,
      );
      if (existing) {
        ensure(existing.snapshot_id === input.snapshotId, "IDEMPOTENCY_CONFLICT");
        return orderValue(existing);
      }
      const confirmation = await db.get<ConfirmationRecord | undefined>(
        sql`SELECT * FROM confirmations WHERE id=${input.snapshotId} AND store_id=${actor.storeId} AND table_session_id=${actor.tableSessionId}`,
      );
      ensure(confirmation, "CONFIRMATION_NOT_FOUND", 404);
      const session = await measured("tablecast.order.session", () => getSession(services, actor));
      const catalog = await measured("tablecast.order.catalog", () =>
        getCatalog(services, actor.storeId, actor.demoId),
      );
      priceCart(
        catalog.configuration,
        cartLineSchema.array().parse(JSON.parse(session.cart_json)),
        session.cart_version,
        await measured("tablecast.order.plan", () => planContext(services, session)),
      );
      if (actor.kind === "voice") {
        const turn = await db.get<{ started_at: number } | undefined>(
          sql`SELECT started_at FROM voice_turns WHERE id=${actor.turnId} AND voice_session_id=${actor.voiceSessionId}`,
        );
        ensure(
          turn && confirmation.read_at && turn.started_at > confirmation.read_at,
          "NEW_APPROVAL_TURN_REQUIRED",
        );
      }
      if (actor.kind === "voice")
        ensure(
          confirmation.channel === "voice" &&
            confirmation.voice_session_id === actor.voiceSessionId &&
            confirmation.status === "read" &&
            !!confirmation.read_at &&
            !!actor.turnId &&
            actor.turnId !== confirmation.created_turn_id,
          "READ_APPROVAL_REQUIRED",
        );
      else
        ensure(
          (actor.kind === "device" || actor.kind === "staff") && confirmation.channel === "gui",
          "CONFIRMATION_CHANNEL",
          403,
        );
      const now = Date.now();
      const mutation = crypto.randomUUID();
      const orderId = crypto.randomUUID();
      const gate = voiceCondition(actor);
      const snapshot: Snapshot = {
        ...snapshotSchema.parse(JSON.parse(confirmation.snapshot_json)),
        status: "submitted",
      };
      const result = await measured("tablecast.order.commit", () =>
        db.batch([
          db
            .update(business.tableSessions)
            .set({
              cart_json: "[]",
              cart_version: sql`cart_version+1`,
              mutation_id: mutation,
            })
            .where(
              sql`id=${actor.tableSessionId} AND store_id=${actor.storeId} AND status='open' AND cart_version=${confirmation.cart_version} AND EXISTS(SELECT 1 FROM confirmations c JOIN stores s ON s.id=c.store_id WHERE c.id=${confirmation.id} AND c.table_session_id=table_sessions.id AND c.cart_version=table_sessions.cart_version AND c.config_version=${sessionConfigVersion(actor.storeId, actor.tableSessionId)} AND c.expires_at>${now} AND c.status=${actor.kind === "voice" ? "read" : "pending"})${gate}`,
            ),
          db
            .insert(business.orders)
            .select(
              sql`SELECT ${orderId},store_id,id,${confirmation.id},${input.idempotencyKey},'submitted',${JSON.stringify(snapshot)},${snapshot.total},${now},${now} FROM table_sessions WHERE id=${actor.tableSessionId} AND mutation_id=${mutation}`,
            ),
          db
            .update(business.confirmations)
            .set({ status: "submitted" })
            .where(
              sql`id=${confirmation.id} AND EXISTS(SELECT 1 FROM table_sessions WHERE id=${actor.tableSessionId} AND mutation_id=${mutation})`,
            ),
          eventStatement(services, actor, mutation, "order.submitted", {
            orderId,
            total: snapshot.total,
            source: actor.kind,
          }),
        ]),
      );
      if (result[0]?.meta.changes !== 1) {
        const retry = await db.get<OrderRecord | undefined>(
          sql`SELECT * FROM orders WHERE table_session_id=${actor.tableSessionId} AND idempotency_key=${input.idempotencyKey} AND snapshot_id=${input.snapshotId}`,
        );
        if (retry) return orderValue(retry);
        throw new DomainError("CONFIRMATION_STALE", 409, "CONFIRMATION_STALE");
      }
      await measured("tablecast.order.notify", () =>
        notifyStore(services, actor.storeId, actor.tableSessionId),
      );
      return {
        id: orderId,
        tableSessionId: session.id,
        snapshotId: snapshot.id,
        idempotencyKey: input.idempotencyKey,
        status: "submitted",
        snapshot,
        total: snapshot.total,
        createdAt: now,
      };
    },
    { env: services.env, input: { actor, input } },
  );
}

export async function changeOrderStatus(
  services: ApiServices,
  actor: Actor,
  orderId: string,
  status: Order["status"],
): Promise<Order> {
  return observeOperation(
    "tablecast.order.status",
    async () => {
      const db = services.db;

      ensure(actor.kind === "staff", "STAFF_REQUIRED", 403);
      const row = await db.get<OrderRecord | undefined>(
        sql`SELECT * FROM orders WHERE id=${orderId} AND store_id=${actor.storeId}`,
      );
      ensure(row, "ORDER_NOT_FOUND", 404);
      await getSession(services, { ...actor, tableSessionId: row.table_session_id });
      if (row.status === status) return orderValue(row);
      const transitions: Record<Order["status"], Order["status"][]> = {
        submitted: ["accepted", "rejected", "cancelled"],
        accepted: ["served", "cancelled"],
        served: [],
        cancelled: [],
        rejected: [],
      };
      ensure(transitions[row.status].includes(status), "ORDER_TRANSITION");
      const scoped = { ...actor, tableSessionId: row.table_session_id };
      const table = await getTableState(services, scoped);
      if (status === "cancelled" || status === "rejected")
        ensure(table.bill.due >= row.total, "PAYMENT_CORRECTION_REQUIRED");
      const mutation = crypto.randomUUID();
      const now = Date.now();
      const result = await db.batch([
        db
          .update(business.tableSessions)
          .set({ cart_version: sql`cart_version+1`, mutation_id: mutation })
          .where(
            sql`id=${row.table_session_id} AND store_id=${actor.storeId} AND cart_version=${table.cart.version} AND status='open' AND EXISTS(SELECT 1 FROM orders WHERE id=${orderId} AND status=${row.status})`,
          ),
        db
          .update(business.orders)
          .set({ status: status, updated_at: now })
          .where(
            sql`id=${orderId} AND EXISTS(SELECT 1 FROM table_sessions WHERE id=${row.table_session_id} AND mutation_id=${mutation})`,
          ),
        invalidationStatement(services, scoped, mutation),
        eventStatement(services, scoped, mutation, "order.status", { orderId, status }),
      ]);
      ensure(result[0]?.meta.changes === 1, "ORDER_CONFLICT");
      await notifyStore(services, actor.storeId, actor.tableSessionId);
      return { ...orderValue(row), status };
    },
    { env: services.env, input: { actor, orderId, status } },
  );
}

export async function recordPayment(
  services: ApiServices,
  actor: Actor,
  input: { amount: number; idempotencyKey: string; kind: "payment" | "adjustment"; reason: string },
) {
  return observeOperation(
    "tablecast.payment.record",
    async () => {
      const db = services.db;

      ensure(actor.kind === "staff" && actor.userId, "STAFF_REQUIRED", 403);
      const existing = await db.get<{ amount: number; kind: string; reason: string } | undefined>(
        sql`SELECT amount,kind,reason FROM payments WHERE table_session_id=${actor.tableSessionId} AND idempotency_key=${input.idempotencyKey}`,
      );
      if (existing) {
        ensure(
          existing.amount === input.amount &&
            existing.kind === input.kind &&
            existing.reason === input.reason,
          "IDEMPOTENCY_CONFLICT",
        );
        return getTableState(services, actor);
      }
      const table = await getTableState(services, actor);
      ensure(table.status === "open", "SESSION_CLOSED");
      if (input.kind === "payment")
        ensure(
          input.amount > 0
            ? input.amount <= table.bill.due
            : table.bill.paidTotal + input.amount >= 0,
          "PAYMENT_AMOUNT",
          422,
        );
      else ensure(table.bill.due + input.amount >= 0, "ADJUSTMENT_AMOUNT", 422);
      const mutation = crypto.randomUUID();
      const result = await db.batch([
        db
          .update(business.tableSessions)
          .set({ cart_version: sql`cart_version+1`, mutation_id: mutation })
          .where(
            sql`id=${actor.tableSessionId} AND store_id=${actor.storeId} AND cart_version=${table.cart.version} AND status='open'`,
          ),
        db
          .insert(business.payments)
          .select(
            sql`SELECT ${crypto.randomUUID()},store_id,id,${input.idempotencyKey},${input.kind},${input.amount},${input.reason},${actor.userId},${Date.now()} FROM table_sessions WHERE id=${actor.tableSessionId} AND mutation_id=${mutation}`,
          ),
        invalidationStatement(services, actor, mutation),
        eventStatement(services, actor, mutation, `billing.${input.kind}`, {
          amount: input.amount,
          reason: input.reason,
        }),
      ]);
      if (result[0]?.meta.changes !== 1) {
        const retry = await db.get<{ amount: number; kind: string; reason: string } | undefined>(
          sql`SELECT amount,kind,reason FROM payments WHERE table_session_id=${actor.tableSessionId} AND idempotency_key=${input.idempotencyKey}`,
        );
        ensure(
          retry &&
            retry.amount === input.amount &&
            retry.kind === input.kind &&
            retry.reason === input.reason,
          "BILLING_CONFLICT",
        );
      }
      await notifyStore(services, actor.storeId, actor.tableSessionId);
      return getTableState(services, actor);
    },
    { env: services.env, input: { actor, input } },
  );
}
