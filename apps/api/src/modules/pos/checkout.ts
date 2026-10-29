import { and, eq, inArray, isNull, notExists, or, sql } from "drizzle-orm";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import type { PosAdapter, PosRemoteOrder } from "./adapter";
import type { PosCheckoutView, PosIssue } from "./model";
import { posCheckouts, posConnections, posPayments, posWebhookEvents } from "../../db/pos-schema";
import { payments, tableSessions } from "../../db/table-schema";
import { DomainError, ensure } from "../../platform/errors";
import { confirmedVisitCouponStatements } from "../customer-coupons/issuance";
import { eventStatement, mutationGate, notifyStore } from "../tables/mutations";
import { publicPosConnection, requirePosStaff } from "./connections";
import { connectedAdapter, posConfigured, posMode } from "./credentials";
import { posInvoiceSchema, posIssueSchema } from "./model";
import { currentPosInvoice, findPosConnection, latestPosCheckout } from "./queries";

type Attempt = typeof posCheckouts.$inferSelect;
type Connection = typeof posConnections.$inferSelect;
const active = ["preparing", "pending", "review"] as const;
const isLocked = (row: Attempt | undefined) =>
  Boolean(row && active.some((status) => status === row.status));
const codeOf = (error: unknown) =>
  error instanceof DomainError ? error.code : "POS_UNKNOWN_OUTCOME";

async function requireReauthorization(services: ApiServices, connection: Connection) {
  await services.db
    .update(posConnections)
    .set({ status: "reauthorize" })
    .where(
      and(
        eq(posConnections.id, connection.id),
        eq(posConnections.credentials, connection.credentials),
        eq(posConnections.revision, connection.revision),
        eq(posConnections.status, connection.status),
      ),
    );
}

export async function getPosCheckout(
  services: ApiServices,
  actor: Actor,
): Promise<PosCheckoutView> {
  requirePosStaff(actor);
  const [connection, checkout] = await Promise.all([
    findPosConnection(services, actor.storeId),
    latestPosCheckout(services, actor),
  ]);
  const result = await currentPosInvoice(services, actor, connection);
  const locked = isLocked(checkout);
  const issues: PosIssue[] =
    !connection || connection.status === "disconnected" || connection.status === "disconnecting"
      ? [{ code: "POS_CONNECTION_REQUIRED" }]
      : connection.status === "reauthorize"
        ? [{ code: "POS_AUTH_REQUIRED" }]
        : !connection.locationId
          ? [{ code: "POS_LOCATION_REQUIRED" }]
          : !connection.deviceId
            ? [{ code: "POS_DEVICE_REQUIRED" }]
            : [];
  if (!posConfigured(services.env)) issues.push({ code: "POS_NOT_CONFIGURED" });
  if (connection && connection.mode !== posMode(services.env))
    issues.push({ code: "POS_ENVIRONMENT_MISMATCH" });
  if (!locked && checkout?.status !== "completed") issues.push(...result.issues);
  return {
    connection: publicPosConnection(connection),
    checkout: checkout
      ? {
          id: checkout.id,
          status: checkout.status,
          amount: posInvoiceSchema.parse(JSON.parse(checkout.invoiceJson)).total,
          currency: "JPY",
          updatedAt: checkout.updatedAt,
          issue: checkout.issue,
        }
      : null,
    invoice:
      checkout && (locked || checkout.status === "completed")
        ? posInvoiceSchema.parse(JSON.parse(checkout.invoiceJson))
        : result.invoice,
    issues,
    locked,
    canStart: !locked && checkout?.status !== "completed" && issues.length === 0,
    canCancel: locked && Boolean(checkout?.externalOrderId),
    canReconcile: locked,
  };
}
function validateOrder(order: PosRemoteOrder, attempt: Attempt) {
  const invoice = posInvoiceSchema.parse(JSON.parse(attempt.invoiceJson));
  ensure(
    order.id === attempt.externalOrderId &&
      order.locationId === attempt.locationId &&
      order.currency === "JPY" &&
      order.amount === invoice.total,
    "POS_TOTAL_MISMATCH",
    409,
  );
  return invoice;
}
async function saveAttempt(
  services: ApiServices,
  attempt: Attempt,
  values: Partial<typeof posCheckouts.$inferInsert>,
  claim?: string,
) {
  await services.db
    .update(posCheckouts)
    .set({ ...values, updatedAt: Date.now() })
    .where(
      and(
        eq(posCheckouts.id, attempt.id),
        inArray(posCheckouts.status, active),
        claim ? eq(posCheckouts.mutationId, claim) : undefined,
      ),
    );
  const row = await services.db
    .select()
    .from(posCheckouts)
    .where(eq(posCheckouts.id, attempt.id))
    .get();
  ensure(row, "POS_CHECKOUT_CONFLICT");
  return row;
}
async function settleAttempt(services: ApiServices, attempt: Attempt, paymentIds: string[]) {
  const invoice = posInvoiceSchema.parse(JSON.parse(attempt.invoiceJson));
  const token = crypto.randomUUID();
  const actor: Actor = {
    kind: "staff",
    storeId: attempt.storeId,
    tableSessionId: attempt.sessionId,
    userId: attempt.createdBy,
  };
  const gate = sql`EXISTS(SELECT 1 FROM pos_checkouts WHERE id=${attempt.id} AND mutation_id=${token} AND status='completed')`;
  const [transition] = await services.db.batch([
    services.db
      .update(posCheckouts)
      .set({
        status: "completed",
        issue: null,
        mutationId: token,
        externalPaymentIdsJson: JSON.stringify(paymentIds),
        updatedAt: Date.now(),
      })
      .where(and(eq(posCheckouts.id, attempt.id), inArray(posCheckouts.status, active))),
    services.db
      .update(tableSessions)
      .set({ cart_version: sql`cart_version+1`, mutation_id: token })
      .where(
        and(
          eq(tableSessions.id, attempt.sessionId),
          eq(tableSessions.store_id, attempt.storeId),
          gate,
        ),
      ),
    ...(invoice.total > 0
      ? [
          services.db.insert(payments).select(
            services.db
              .select({
                id: sql<string>`${"pos:" + attempt.id}`.as("id"),
                store_id: tableSessions.store_id,
                table_session_id: tableSessions.id,
                idempotency_key: sql<string>`${"pos:" + attempt.id}`.as("idempotency_key"),
                kind: sql<"payment">`'payment'`.as("kind"),
                amount: sql<number>`${invoice.total}`.as("amount"),
                reason: sql<string>`'Square'`.as("reason"),
                actor_id: sql<string>`${attempt.createdBy}`.as("actor_id"),
                created_at: sql<number>`${Date.now()}`.as("created_at"),
              })
              .from(tableSessions)
              .where(and(eq(tableSessions.id, attempt.sessionId), gate)),
          ),
        ]
      : []),
    ...paymentIds.map((id) =>
      services.db.insert(posPayments).select(
        services.db
          .select({
            id: sql<string>`${attempt.id + ":" + id}`.as("id"),
            connectionId: posCheckouts.connectionId,
            checkoutId: posCheckouts.id,
            externalId: sql<string>`${id}`.as("external_id"),
          })
          .from(posCheckouts)
          .where(and(eq(posCheckouts.id, attempt.id), gate)),
      ),
    ),
    ...confirmedVisitCouponStatements(
      services,
      attempt.storeId,
      attempt.sessionId,
      mutationGate(services, actor, token),
    ),
    eventStatement(services, actor, token, "pos.settled", {
      checkoutId: attempt.id,
      amount: invoice.total,
    }),
  ]);
  if (transition.meta.changes === 1)
    await notifyStore(services, attempt.storeId, attempt.sessionId);
}
async function completeCancellation(
  services: ApiServices,
  attempt: Attempt,
  rejection?: { claim: string; issue: string },
) {
  const token = crypto.randomUUID();
  const actor: Actor = {
    kind: "staff",
    storeId: attempt.storeId,
    tableSessionId: attempt.sessionId,
  };
  const [transition] = await services.db.batch([
    services.db
      .update(posCheckouts)
      .set({
        status: "cancelled",
        issue: rejection?.issue ?? null,
        mutationId: token,
        updatedAt: Date.now(),
      })
      .where(
        and(
          eq(posCheckouts.id, attempt.id),
          inArray(posCheckouts.status, active),
          rejection ? eq(posCheckouts.mutationId, rejection.claim) : undefined,
        ),
      ),
    services.db
      .update(tableSessions)
      .set({ cart_version: sql`cart_version+1`, mutation_id: token })
      .where(
        and(
          eq(tableSessions.id, attempt.sessionId),
          eq(tableSessions.store_id, attempt.storeId),
          sql`EXISTS(SELECT 1 FROM pos_checkouts WHERE id=${attempt.id} AND mutation_id=${token})`,
        ),
      ),
    eventStatement(services, actor, token, "pos.cancelled", { checkoutId: attempt.id }),
  ]);
  if (transition.meta.changes === 1)
    await notifyStore(services, attempt.storeId, attempt.sessionId);
}
async function resumeAttempt(
  services: ApiServices,
  connection: Connection,
  original: Attempt,
  adapter: PosAdapter,
) {
  let attempt = original;
  if (!isLocked(attempt)) return;
  try {
    ensure(
      adapter.capabilities.orderExport &&
        typeof adapter.createOrder === "function" &&
        typeof adapter.getOrder === "function",
      "POS_UNSUPPORTED",
      422,
    );
    const invoice = posInvoiceSchema.parse(JSON.parse(attempt.invoiceJson));
    if (!attempt.externalOrderId) {
      // SDKの15秒timeoutより長くclaimを保持し、初回の確定拒否と応答喪失を分ける。
      // 期限後の引継ぎでは先行要求の結果が不明なので、自動解除しない。
      if (attempt.mutationId && attempt.updatedAt > Date.now() - 30_000) return;
      const firstRequest = !attempt.mutationId && !attempt.issue;
      const claim = crypto.randomUUID();
      const claimed = await services.db
        .update(posCheckouts)
        .set({ mutationId: claim, issue: "POS_UNKNOWN_OUTCOME", updatedAt: Date.now() })
        .where(
          and(
            eq(posCheckouts.id, attempt.id),
            inArray(posCheckouts.status, active),
            isNull(posCheckouts.externalOrderId),
            eq(posCheckouts.updatedAt, attempt.updatedAt),
            attempt.issue ? eq(posCheckouts.issue, attempt.issue) : isNull(posCheckouts.issue),
            attempt.mutationId
              ? eq(posCheckouts.mutationId, attempt.mutationId)
              : isNull(posCheckouts.mutationId),
          ),
        )
        .returning();
      if (!claimed[0]) return;
      attempt = claimed[0];
      try {
        const order = await adapter.createOrder(invoice, attempt.locationId, attempt.id + ":order");
        attempt = await saveAttempt(
          services,
          attempt,
          { externalOrderId: order.id, mutationId: null, issue: null },
          claim,
        );
        if (!attempt.externalOrderId) return;
      } catch (error) {
        if (error instanceof DomainError && error.code === "POS_ORDER_REJECTED") {
          const issue =
            error.status === 401
              ? "POS_AUTH_REQUIRED"
              : error.status === 503
                ? "POS_PROVIDER_UNAVAILABLE"
                : "POS_UNSUPPORTED";
          if (error.status === 401) await requireReauthorization(services, connection);
          if (firstRequest) await completeCancellation(services, attempt, { claim, issue });
          else
            await saveAttempt(
              services,
              attempt,
              { status: "review", issue: "POS_UNKNOWN_OUTCOME", mutationId: null },
              claim,
            );
        } else {
          await saveAttempt(
            services,
            attempt,
            { status: "review", issue: codeOf(error), mutationId: null },
            claim,
          );
        }
        return;
      }
    }
    ensure(attempt.externalOrderId, "POS_UNKNOWN_OUTCOME");
    let order = await adapter.getOrder(attempt.externalOrderId);
    validateOrder(order, attempt);
    if (order.status === "cancelled") {
      await completeCancellation(services, attempt);
      return;
    }
    if (invoice.total === 0 && order.status === "open") {
      ensure(typeof adapter.settleZeroOrder === "function", "POS_UNSUPPORTED", 422);
      order = await adapter.settleZeroOrder(order.id, attempt.id + ":zero");
    }
    if (invoice.total > 0 && !attempt.externalCheckoutId) {
      ensure(adapter.capabilities.checkout && adapter.checkout, "POS_UNSUPPORTED", 422);
      const checkout = await adapter.checkout.start(
        order,
        attempt.deviceId,
        attempt.id + ":checkout",
      );
      ensure(
        checkout.orderId === order.id &&
          checkout.locationId === attempt.locationId &&
          checkout.amount === invoice.total &&
          checkout.currency === "JPY",
        "POS_TOTAL_MISMATCH",
      );
      attempt = await saveAttempt(services, attempt, {
        externalCheckoutId: checkout.id,
        status: "pending",
        issue: null,
      });
    }
    let checkout;
    if (attempt.externalCheckoutId) {
      ensure(adapter.checkout, "POS_UNSUPPORTED", 422);
      checkout = await adapter.checkout.get(attempt.externalCheckoutId);
      ensure(
        checkout.id === attempt.externalCheckoutId &&
          checkout.orderId === attempt.externalOrderId &&
          checkout.locationId === attempt.locationId &&
          checkout.amount === invoice.total &&
          checkout.currency === "JPY",
        "POS_TOTAL_MISMATCH",
      );
      // 端末の取消通知だけでは解放せず、注文側の取消成功まで確認する。
      if (checkout.status === "cancelled") {
        ensure(typeof adapter.cancelOrder === "function", "POS_UNSUPPORTED", 422);
        order = await adapter.getOrder(attempt.externalOrderId);
        validateOrder(order, attempt);
        if (order.status === "open") order = await adapter.cancelOrder(order.id);
        if (order.status === "cancelled") {
          await completeCancellation(services, attempt);
          return;
        }
      }
    }
    order = await adapter.getOrder(order.id);
    validateOrder(order, attempt);
    if (order.status === "completed" && (invoice.total === 0 || checkout?.status === "completed")) {
      const paymentIds = [
        ...new Set([...(order.paymentIds ?? []), ...(checkout?.paymentIds ?? [])]),
      ];
      ensure(invoice.total === 0 || paymentIds.length > 0, "POS_UNKNOWN_OUTCOME");
      const verified = await Promise.all(
        paymentIds.map((id) => {
          ensure(typeof adapter.getPayment === "function", "POS_UNSUPPORTED", 422);
          return adapter.getPayment(id);
        }),
      );
      ensure(
        verified.every(
          (payment) =>
            payment.completed &&
            payment.locationId === attempt.locationId &&
            payment.orderId === attempt.externalOrderId &&
            payment.currency === "JPY" &&
            payment.checkoutId === attempt.externalCheckoutId,
        ) && verified.reduce((total, payment) => total + payment.amount, 0) === invoice.total,
        "POS_TOTAL_MISMATCH",
      );
      await settleAttempt(services, attempt, paymentIds);
    } else {
      await saveAttempt(services, attempt, {
        status: order.status === "unknown" || checkout?.status === "unknown" ? "review" : "pending",
        issue:
          order.status === "unknown" || checkout?.status === "unknown"
            ? "POS_UNKNOWN_OUTCOME"
            : null,
      });
    }
  } catch (error) {
    const code = codeOf(error);
    if (code === "POS_AUTH_REQUIRED") await requireReauthorization(services, connection);
    await saveAttempt(services, attempt, { status: "review", issue: code });
  }
}
export async function previewPosCheckout(services: ApiServices, actor: Actor) {
  const view = await getPosCheckout(services, actor);
  if (!view.canStart || !view.invoice) return view;
  const connection = await findPosConnection(services, actor.storeId);
  ensure(connection?.locationId, "POS_LOCATION_REQUIRED", 422);
  const adapter = await connectedAdapter(services, connection);
  ensure(adapter.capabilities.quote && typeof adapter.quote === "function", "POS_UNSUPPORTED", 422);
  let quote;
  try {
    quote = await adapter.quote(view.invoice, connection.locationId);
  } catch (error) {
    if (
      error instanceof DomainError &&
      [
        "POS_PRICE_MISMATCH",
        "POS_PRODUCT_UNAVAILABLE",
        "POS_MAPPING_REQUIRED",
        "POS_UNSUPPORTED",
      ].includes(error.code)
    ) {
      const details = posIssueSchema.array().safeParse(error.details);
      return {
        ...view,
        canStart: false,
        issues: [...view.issues, ...(details.success ? details.data : [{ code: error.code }])],
      };
    }
    throw error;
  }
  if (quote.currency !== "JPY" || quote.amount !== view.invoice.total)
    return {
      ...view,
      canStart: false,
      issues: [
        ...view.issues,
        { code: "POS_TOTAL_MISMATCH", expected: view.invoice.total, actual: quote.amount },
      ],
    };
  return view;
}
export async function startPosCheckout(
  services: ApiServices,
  actor: Actor,
  input: { expectedVersion: number; idempotencyKey: string },
) {
  requirePosStaff(actor);
  const connection = await findPosConnection(services, actor.storeId);
  ensure(
    connection?.status === "connected" && connection.locationId,
    "POS_CONNECTION_REQUIRED",
    422,
  );
  const existing = await services.db
    .select()
    .from(posCheckouts)
    .where(
      and(
        eq(posCheckouts.storeId, actor.storeId),
        eq(posCheckouts.sessionId, actor.tableSessionId ?? ""),
        eq(posCheckouts.idempotencyKey, input.idempotencyKey),
      ),
    )
    .get();
  const adapter = await connectedAdapter(services, connection);
  if (existing) {
    ensure(
      posInvoiceSchema.parse(JSON.parse(existing.invoiceJson)).version === input.expectedVersion,
      "IDEMPOTENCY_CONFLICT",
    );
    await resumeAttempt(services, connection, existing, adapter);
    return getPosCheckout(services, actor);
  }
  const view = await previewPosCheckout(services, actor);
  ensure(view.canStart && view.invoice, "POS_CHECKOUT_CONFLICT", 409, view.issues);
  ensure(view.invoice.version === input.expectedVersion, "POS_VERSION_CONFLICT");
  const id = crypto.randomUUID(),
    now = Date.now();
  const invoice = { ...view.invoice, id };
  const result = await services.db
    .insert(posCheckouts)
    .select(
      services.db
        .select({
          id: sql<string>`${id}`.as("id"),
          storeId: tableSessions.store_id,
          sessionId: tableSessions.id,
          connectionId: sql<string>`${connection.id}`.as("connection_id"),
          idempotencyKey: sql<string>`${input.idempotencyKey}`.as("idempotency_key"),
          invoiceJson: sql<string>`${JSON.stringify(invoice)}`.as("invoice_json"),
          locationId: sql<string>`${connection.locationId}`.as("location_id"),
          deviceId: sql<string>`${connection.deviceId}`.as("device_id"),
          revision: sql<number>`${connection.revision}`.as("revision"),
          status: sql<"preparing">`'preparing'`.as("status"),
          issue: sql<null>`NULL`.as("issue"),
          mutationId: sql<null>`NULL`.as("mutation_id"),
          externalOrderId: sql<null>`NULL`.as("external_order_id"),
          externalCheckoutId: sql<null>`NULL`.as("external_checkout_id"),
          externalPaymentIdsJson: sql<string>`'[]'`.as("external_payment_ids_json"),
          createdBy: sql<string>`${actor.userId}`.as("created_by"),
          createdAt: sql<number>`${now}`.as("created_at"),
          updatedAt: sql<number>`${now}`.as("updated_at"),
        })
        .from(tableSessions)
        .where(
          and(
            eq(tableSessions.id, actor.tableSessionId ?? ""),
            eq(tableSessions.store_id, actor.storeId),
            eq(tableSessions.status, "open"),
            eq(tableSessions.cart_version, input.expectedVersion),
            notExists(
              services.db
                .select({ id: posCheckouts.id })
                .from(posCheckouts)
                .where(
                  and(
                    eq(posCheckouts.sessionId, actor.tableSessionId ?? ""),
                    inArray(posCheckouts.status, active),
                  ),
                ),
            ),
            sql`EXISTS(SELECT 1 FROM pos_connections WHERE id=${connection.id} AND revision=${connection.revision} AND status='connected')`,
          ),
        ),
    )
    .onConflictDoNothing();
  if (!result.meta.changes) {
    const retry = await services.db
      .select()
      .from(posCheckouts)
      .where(
        and(
          eq(posCheckouts.storeId, actor.storeId),
          eq(posCheckouts.sessionId, actor.tableSessionId ?? ""),
          eq(posCheckouts.idempotencyKey, input.idempotencyKey),
        ),
      )
      .get();
    ensure(retry, "POS_CHECKOUT_LOCKED");
    await resumeAttempt(services, connection, retry, adapter);
  } else {
    const attempt = await services.db
      .select()
      .from(posCheckouts)
      .where(eq(posCheckouts.id, id))
      .get();
    ensure(attempt, "POS_CHECKOUT_CONFLICT");
    await resumeAttempt(services, connection, attempt, adapter);
  }
  return getPosCheckout(services, actor);
}
export async function reconcilePosCheckout(services: ApiServices, actor: Actor, cancel = false) {
  requirePosStaff(actor);
  const [connection, attempt] = await Promise.all([
    findPosConnection(services, actor.storeId),
    latestPosCheckout(services, actor),
  ]);
  ensure(
    connection && attempt && connection.id === attempt.connectionId,
    "POS_CONNECTION_REQUIRED",
    422,
  );
  const adapter = await connectedAdapter(services, connection);
  if (cancel && isLocked(attempt)) {
    ensure(
      adapter.capabilities.cancel && typeof adapter.cancelOrder === "function",
      "POS_UNSUPPORTED",
      422,
    );
    if (attempt.externalCheckoutId) {
      ensure(adapter.checkout, "POS_UNSUPPORTED", 422);
      await adapter.checkout.cancel(attempt.externalCheckoutId);
    } else if (attempt.externalOrderId) {
      await adapter.cancelOrder(attempt.externalOrderId);
    } else ensure(false, "POS_UNKNOWN_OUTCOME");
  }
  await resumeAttempt(services, connection, attempt, adapter);
  return getPosCheckout(services, actor);
}
export async function reconcilePosWebhook(
  services: ApiServices,
  notification: {
    externalCheckoutId?: string;
    externalOrderId?: string;
    externalPaymentId?: string;
    id: string;
    merchantId: string;
  },
) {
  const targets = [
    ...(notification.externalOrderId
      ? [eq(posCheckouts.externalOrderId, notification.externalOrderId)]
      : []),
    ...(notification.externalCheckoutId
      ? [eq(posCheckouts.externalCheckoutId, notification.externalCheckoutId)]
      : []),
  ];
  if (!targets.length) return;
  const rows = await services.db
    .select({ attempt: posCheckouts, connection: posConnections })
    .from(posCheckouts)
    .innerJoin(posConnections, eq(posCheckouts.connectionId, posConnections.id))
    .where(and(eq(posConnections.merchantId, notification.merchantId), or(...targets)))
    .limit(1);
  const target = rows[0];
  if (!target) return;
  const eventKey = target.connection.id + ":" + notification.id;
  const duplicate = await services.db
    .select({ id: posWebhookEvents.id })
    .from(posWebhookEvents)
    .where(eq(posWebhookEvents.id, eventKey))
    .get();
  if (duplicate) return;
  await resumeAttempt(
    services,
    target.connection,
    target.attempt,
    await connectedAdapter(services, target.connection),
  );
  const updated = await services.db
    .select({ status: posCheckouts.status })
    .from(posCheckouts)
    .where(eq(posCheckouts.id, target.attempt.id))
    .get();
  ensure(
    updated && (updated.status === "completed" || updated.status === "cancelled"),
    "POS_PROVIDER_UNAVAILABLE",
    503,
  );
  await services.db
    .insert(posWebhookEvents)
    .values({
      id: eventKey,
      connectionId: target.connection.id,
      createdAt: Date.now(),
    })
    .onConflictDoNothing();
}
