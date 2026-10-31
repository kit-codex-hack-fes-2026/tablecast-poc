import { sql } from "drizzle-orm";
import type { ApiServices } from "../../../platform/context";
import type { Actor } from "../../auth/model";
import type { CoreState, StateView, TableState } from "../../tables/model";
import * as business from "../../../db/business-schema";
import { ensure } from "../../../platform/errors";
import { measured, observeOperation, recordD1Update } from "../../../platform/telemetry";
import { priceCart } from "../../catalog/pricing";
import { sessionConfigVersion } from "../../catalog/queries";
import {
  eventStatement,
  invalidationStatement,
  notifyStore,
  voiceCondition,
} from "../../tables/mutations";
import { getPricingContext, getSession } from "../../tables/queries";
import { withStateRead } from "../../tables/state-read";
import { type CartUpdate } from "../model";

export function updateCart(
  services: ApiServices,
  actor: Actor,
  input: CartUpdate,
  view: "core",
): Promise<CoreState>;
export function updateCart(
  services: ApiServices,
  actor: Actor,
  input: CartUpdate,
  view?: "full",
): Promise<TableState>;
export function updateCart(
  services: ApiServices,
  actor: Actor,
  input: CartUpdate,
  view: StateView,
): Promise<CoreState | TableState>;
export async function updateCart(
  services: ApiServices,
  actor: Actor,
  input: CartUpdate,
  view: StateView = "full",
): Promise<CoreState | TableState> {
  return observeOperation(
    "tablecast.cart.update",
    async () => {
      const db = services.db;

      const session = await measured("tablecast.cart.session", () => getSession(services, actor));
      ensure(session.status === "open", "SESSION_CLOSED");
      const { catalog, plan } = await measured("tablecast.cart.pricing", () =>
        getPricingContext(services, session),
      );
      priceCart(catalog.configuration, input.lines, input.expectedVersion, plan);
      const mutation = crypto.randomUUID();
      const gate = voiceCondition(actor);
      return withStateRead(services, actor, view, async (queries, decode) => {
        const [updated, , event, ...state] = await measured("tablecast.cart.commit", () =>
          db.batch([
            db
              .update(business.tableSessions)
              .set({
                cart_json: JSON.stringify(input.lines),
                cart_version: sql`cart_version+1`,
                mutation_id: mutation,
                ...(input.dismissProductId
                  ? {
                      selected_product_id: sql`CASE WHEN selected_product_id=${input.dismissProductId} THEN NULL ELSE selected_product_id END`,
                    }
                  : {}),
              })
              .where(
                sql`id=${session.id} AND store_id=${actor.storeId} AND status='open' AND cart_version=${input.expectedVersion} AND ${sessionConfigVersion(actor.storeId, actor.tableSessionId)}=${catalog.version}${gate}`,
              ),
            invalidationStatement(services, actor, mutation),
            eventStatement(services, actor, mutation, "cart.updated", {
              version: input.expectedVersion + 1,
              source: actor.kind,
            }),
            ...queries,
          ] as const),
        );
        ensure(updated.meta.changes === 1, "CART_CONFLICT");
        recordD1Update(updated.meta);
        await notifyStore(services, actor.storeId, actor.tableSessionId, {
          cursor: event.meta.last_row_id ?? 0,
          demoId: session.kind === "demo" ? session.id : undefined,
        });
        return decode(state);
      });
    },
    { env: services.env, input: { actor, input } },
  );
}
