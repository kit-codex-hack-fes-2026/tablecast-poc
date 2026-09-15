import { env } from "cloudflare:workers";
import * as business from "../src/db/business-schema";
import type { Actor } from "../src/modules/auth/model";
import type { Order, Snapshot } from "../src/modules/orders/model";
import { insertFixture } from "./database-fixture";

export const statisticsPeriod = {
  from: "2026-09-01T00:00:00+09:00",
  to: "2026-09-02T00:00:00+09:00",
};
export async function addStatisticsSession(
  actor: Actor,
  input: {
    id: string;
    closedAt: number;
    plan?: boolean;
    demo?: boolean;
    orders?: { productId: string; quantity: number; status?: Order["status"]; name?: string }[];
    payments?: { kind: "payment" | "adjustment"; amount: number }[];
  },
) {
  const openedAt = Date.parse(statisticsPeriod.from) - 86400000;
  await env.TABLECAST_DB.batch([
    insertFixture(business.tableSessions, {
      id: input.id,
      store_id: actor.storeId,
      table_id: input.demo ? null : "tablecast-table",
      kind: input.demo ? "demo" : "table",
      locale: "ja",
      guest_count: 2,
      opened_at: openedAt,
      closed_at: input.closedAt,
      status: "closed",
      plan_json: input.plan ? JSON.stringify({ id: "plan", rules: {} }) : null,
    }),
    ...["staff.called", "bill.requested"].map((kind) =>
      insertFixture(business.tableEvents, {
        store_id: actor.storeId,
        table_session_id: input.id,
        kind,
        data_json: "{}",
        created_at: openedAt,
      }),
    ),
    ...(input.payments ?? []).map((payment, index) =>
      insertFixture(business.payments, {
        id: `${input.id}-payment-${index}`,
        store_id: actor.storeId,
        table_session_id: input.id,
        idempotency_key: `${input.id}-payment-${index}`,
        ...payment,
        reason: "試験",
        actor_id: actor.userId ?? "",
        created_at: openedAt,
      }),
    ),
  ]);
  for (const [index, order] of (input.orders ?? []).entries()) {
    const id = `${input.id}-order-${index}`;
    const name = { ja: order.name ?? "過去の商品", en: "Historical item" };
    const snapshot: Snapshot = {
      id,
      tableSessionId: input.id,
      cartVersion: 1,
      configVersion: 1,
      lines: [
        {
          id,
          productId: order.productId,
          quantity: order.quantity,
          selections: [{ optionId: "extra", quantity: 2 }],
          name,
          speechName: name,
          options: [
            {
              id: "extra",
              name: { ja: "追加", en: "Extra" },
              speechName: name,
              quantity: 2,
              priceDelta: 50,
            },
          ],
          unitPrice: 300,
          total: input.plan ? 0 : 300 * order.quantity,
          missing: [],
          planCovered: input.plan ?? false,
        },
      ],
      total: input.plan ? 0 : 300 * order.quantity,
      locale: "ja",
      text: "非公開の会話本文",
      expiresAt: openedAt + 60000,
      channel: "gui",
      status: "submitted",
      createdTurnId: null,
      plan: input.plan ? { id: "plan", name } : null,
    };
    await env.TABLECAST_DB.batch([
      insertFixture(business.confirmations, {
        id,
        store_id: actor.storeId,
        table_session_id: input.id,
        cart_version: 1,
        config_version: 1,
        channel: "gui",
        status: "submitted",
        snapshot_json: JSON.stringify(snapshot),
        expires_at: openedAt + 60000,
        created_at: openedAt,
      }),
      insertFixture(business.orders, {
        id,
        store_id: actor.storeId,
        table_session_id: input.id,
        snapshot_id: id,
        idempotency_key: id,
        status: order.status ?? "served",
        snapshot_json: JSON.stringify(snapshot),
        total: snapshot.total,
        created_at: openedAt + index,
        updated_at: openedAt + index,
      }),
    ]);
  }
}
