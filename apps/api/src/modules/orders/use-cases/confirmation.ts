import { sql } from "drizzle-orm";
import type { ApiServices } from "../../../platform/context";
import type { Actor } from "../../auth/model";
import * as business from "../../../db/business-schema";
import { ensure } from "../../../platform/errors";
import { observeOperation } from "../../../platform/telemetry";
import { confirmationText, priceCart } from "../../catalog/pricing";
import { sessionConfigVersion } from "../../catalog/queries";
import {
  eventStatement,
  invalidationStatement,
  notifyStore,
  voiceCondition,
} from "../../tables/mutations";
import { getPricingContext } from "../../tables/pricing";
import { getSession } from "../../tables/session";
import { cartLineSchema, type Snapshot } from "../model";

export async function prepareConfirmation(
  services: ApiServices,
  actor: Actor,
  input: { channel: "gui" | "voice"; expectedVersion: number },
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
