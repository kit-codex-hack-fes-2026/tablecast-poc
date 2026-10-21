import { sql } from "drizzle-orm";
import type { ApiServices } from "../../../platform/context";
import type { Actor } from "../../auth/model";
import type { TableState } from "../../tables/model";
import * as business from "../../../db/business-schema";
import { ensure } from "../../../platform/errors";
import { observeOperation } from "../../../platform/telemetry";
import { priceCart } from "../../catalog/pricing";
import { sessionConfigVersion } from "../../catalog/queries";
import {
  eventStatement,
  invalidationStatement,
  notifyStore,
  voiceCondition,
} from "../../tables/mutations";
import { getPricingContext, getSession, getTableState } from "../../tables/queries";
import { type CartUpdate } from "../model";

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
      const { catalog, plan } = await getPricingContext(services, session);
      priceCart(catalog.configuration, input.lines, input.expectedVersion, plan);
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
      await notifyStore(services, actor.storeId, actor.tableSessionId, {
        cursor: result.at(-1)?.meta.last_row_id ?? 0,
        demoId: session.kind === "demo" ? session.id : undefined,
      });
      return getTableState(services, actor);
    },
    { env: services.env, input: { actor, input } },
  );
}
