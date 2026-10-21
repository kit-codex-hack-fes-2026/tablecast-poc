import type { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import type { ApiServices } from "../../../platform/context";
import type { Actor } from "../../auth/model";
import * as business from "../../../db/business-schema";
import { DomainError, ensure } from "../../../platform/errors";
import { measured, observeOperation } from "../../../platform/telemetry";
import { confirmationText, priceCart } from "../../catalog/pricing";
import { catalogValue, sessionConfigVersion } from "../../catalog/queries";
import { pointBillingCorrectionStatements } from "../../customer-points/mutations";
import {
  eventStatement,
  invalidationStatement,
  notifyStore,
  voiceCondition,
} from "../../tables/mutations";
import { getPricingContext, getSession } from "../../tables/queries";
import { orderValue, planFromOrders } from "../../tables/values";
import {
  cartLineSchema,
  type Order,
  type prepareSchema,
  type Snapshot,
  snapshotSchema,
  type submitSchema,
} from "../model";
import { orderPrerequisites } from "../prerequisites";

export async function prepareConfirmation(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof prepareSchema>,
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
      const { catalog, plan } = await getPricingContext(services, session);
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
      await notifyStore(services, actor.storeId, actor.tableSessionId, {
        cursor: result.at(-1)?.meta.last_row_id ?? 0,
        demoId: session.kind === "demo" ? session.id : undefined,
      });
      return snapshot;
    },
    { env: services.env, input: { actor, input } },
  );
}

export async function submitOrder(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof submitSchema>,
): Promise<Order> {
  return observeOperation(
    "tablecast.order.submit",
    async () => {
      const db = services.db;

      ensure(input.approved, "APPROVAL_REQUIRED", 422);
      const session = await measured("tablecast.order.session", () => getSession(services, actor));
      const [existingOrders, confirmations, coupons, catalogs, planOrders, turns] = await measured(
        "tablecast.order.prerequisites",
        () => orderPrerequisites(services, actor, session, input),
      );
      const existing = existingOrders[0];
      if (existing) {
        ensure(existing.snapshot_id === input.snapshotId, "IDEMPOTENCY_CONFLICT");
        return orderValue(existing);
      }
      ensure(!coupons[0], "COUPON_CANCEL_REQUIRED", 409);
      const confirmation = confirmations[0];
      ensure(confirmation, "CONFIRMATION_NOT_FOUND", 404);
      const catalog = catalogValue(catalogs[0], session.kind === "demo" ? session.id : undefined);
      const plan = planFromOrders(session, planOrders);
      priceCart(
        catalog.configuration,
        cartLineSchema.array().parse(JSON.parse(session.cart_json)),
        session.cart_version,
        plan,
      );
      if (actor.kind === "voice") {
        const turn = turns[0];
        ensure(turn && turn.started_at > confirmation.created_at, "NEW_APPROVAL_TURN_REQUIRED");
      }
      if (actor.kind === "voice")
        ensure(
          confirmation.channel === "voice" &&
            confirmation.voice_session_id === actor.voiceSessionId &&
            confirmation.status === "pending" &&
            !!actor.turnId &&
            actor.turnId !== confirmation.created_turn_id,
          "APPROVAL_REQUIRED",
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
      const pointCorrections = await pointBillingCorrectionStatements(
        services,
        actor,
        snapshot.total,
        `order:${orderId}`,
        mutation,
      );
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
              sql`id=${actor.tableSessionId} AND store_id=${actor.storeId} AND status='open' AND cart_version=${session.cart_version} AND cart_version=${confirmation.cart_version} AND EXISTS(SELECT 1 FROM confirmations c JOIN stores s ON s.id=c.store_id WHERE c.id=${confirmation.id} AND c.table_session_id=table_sessions.id AND c.cart_version=table_sessions.cart_version AND c.config_version=${sessionConfigVersion(actor.storeId, actor.tableSessionId)} AND c.expires_at>${now} AND c.status='pending')${gate}`,
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
          ...pointCorrections,
          eventStatement(services, actor, mutation, "order.submitted", {
            orderId,
            total: snapshot.total,
            source: actor.kind,
          }),
        ]),
      );
      if (result[0]?.meta.changes !== 1) {
        const retry = await db
          .select()
          .from(business.orders)
          .where(
            and(
              eq(business.orders.table_session_id, session.id),
              eq(business.orders.idempotency_key, input.idempotencyKey),
              eq(business.orders.snapshot_id, input.snapshotId),
            ),
          )
          .get();
        if (retry) return orderValue(retry);
        throw new DomainError("CONFIRMATION_STALE", 409, "CONFIRMATION_STALE");
      }
      await measured("tablecast.order.notify", () =>
        notifyStore(services, actor.storeId, actor.tableSessionId, {
          cursor: result.at(-1)?.meta.last_row_id ?? 0,
          demoId: session.kind === "demo" ? session.id : undefined,
        }),
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
