import { and, desc, eq, exists, gt, inArray, sum as sumAmount } from "drizzle-orm";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import * as business from "../../db/business-schema";
import { ensure } from "../../platform/errors";
import { observeOperation } from "../../platform/telemetry";
import { catalogQuery, catalogValue } from "../catalog/queries";
import { type TableState } from "./model";
import { validateSession } from "./session";
import { tableStateValue } from "./values";

export async function getTableState(services: ApiServices, actor: Actor): Promise<TableState> {
  return observeOperation(
    "tablecast.table.read",
    async () => {
      const db = services.db;
      ensure(actor.tableSessionId, "TABLE_REQUIRED", 403);
      const sessionId = actor.tableSessionId;
      // cursorを先に読む。同じbatchの後続状態より先の更新を既読扱いにしない。
      const [history, sessions, catalogs, tables, orderRows, paymentRows, confirmations] =
        await db.batch([
          db
            .select()
            .from(business.tableEvents)
            .where(
              and(
                eq(business.tableEvents.table_session_id, sessionId),
                eq(business.tableEvents.store_id, actor.storeId),
              ),
            )
            .orderBy(desc(business.tableEvents.cursor))
            .limit(100),
          db
            .select()
            .from(business.tableSessions)
            .where(
              and(
                eq(business.tableSessions.id, sessionId),
                eq(business.tableSessions.store_id, actor.storeId),
              ),
            ),
          catalogQuery(db, actor.storeId, actor.demoId),
          db
            .select({
              id: business.tableSessions.id,
              name: business.restaurantTables.name,
              bill_requested: exists(
                db
                  .select({ cursor: business.tableEvents.cursor })
                  .from(business.tableEvents)
                  .where(
                    and(
                      eq(business.tableEvents.store_id, actor.storeId),
                      eq(business.tableEvents.table_session_id, sessionId),
                      eq(business.tableEvents.kind, "bill.requested"),
                    ),
                  ),
              ).mapWith(Number),
            })
            .from(business.tableSessions)
            .leftJoin(
              business.restaurantTables,
              eq(business.restaurantTables.id, business.tableSessions.table_id),
            )
            .where(
              and(
                eq(business.tableSessions.id, sessionId),
                eq(business.tableSessions.store_id, actor.storeId),
              ),
            ),
          db
            .select()
            .from(business.orders)
            .where(
              and(
                eq(business.orders.table_session_id, sessionId),
                eq(business.orders.store_id, actor.storeId),
              ),
            )
            .orderBy(business.orders.created_at),
          db
            .select({
              table_session_id: business.payments.table_session_id,
              kind: business.payments.kind,
              total: sumAmount(business.payments.amount).mapWith(Number),
            })
            .from(business.payments)
            .where(
              and(
                eq(business.payments.table_session_id, sessionId),
                eq(business.payments.store_id, actor.storeId),
              ),
            )
            .groupBy(business.payments.table_session_id, business.payments.kind),
          db
            .select()
            .from(business.confirmations)
            .where(
              and(
                eq(business.confirmations.table_session_id, sessionId),
                eq(business.confirmations.store_id, actor.storeId),
                inArray(business.confirmations.status, ["pending", "read"]),
                gt(business.confirmations.expires_at, Date.now()),
              ),
            )
            .orderBy(desc(business.confirmations.created_at))
            .limit(1),
        ]);
      const row = await validateSession(services, actor, sessions[0]);
      const catalog = catalogValue(catalogs[0], actor.demoId);
      return tableStateValue(
        row,
        catalog,
        tables[0],
        orderRows,
        paymentRows,
        confirmations[0],
        history.toReversed(),
      );
    },
    { env: services.env, input: { actor } },
  );
}
