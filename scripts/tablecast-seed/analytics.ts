import { type PlanContext } from "@tablecast/api/bootstrap";
import { business, type Database } from "@tablecast/api/db";
import { type CartLine, type Product } from "@tablecast/api/schema";
import { and, eq, like } from "drizzle-orm";
import { type BatchItem } from "drizzle-orm/batch";
import { type Owner, type SeedEvent, type Store } from "../tablecast-seed-data.ts";
import { confirmation, event, insertSession, order, payment, snapshotFor } from "./session.ts";

const tablecastAnalyticsPeriods = [
  { month: "2026-09", startsAt: Date.UTC(2026, 8, 1, 8), sessions: 40 },
  { month: "2026-10", startsAt: Date.UTC(2026, 9, 1, 8), sessions: 60 },
] as const;

const popular: Record<string, string[]> = {
  "tablecast-komorebi": [
    "karaage",
    "sashimi",
    "karaage",
    "edamame",
    "yakitori",
    "karaage",
    "tuna-sashimi",
    "tamagoyaki",
  ],
  "tablecast-hanul": [
    "bulgogi",
    "bibimbap",
    "fried-chicken",
    "bulgogi",
    "samgyeopsal",
    "seafood-pajeon",
    "gimbap",
    "bulgogi",
  ],
  "tablecast-koharu": [
    "westward-classic",
    "fries",
    "westward-classic",
    "chicken-burger",
    "mushroom-burger",
    "fries",
    "westward-classic",
    "slaw",
  ],
};

function lineFor(product: Product, index: number, excluded: string[] = []): CartLine {
  return {
    id: "tablecast-seed-line",
    productId: product.id,
    quantity: 1 + (index % 2),
    selections: product.modifiers.flatMap((group) => {
      const options = group.options.filter(
        (option) => option.available && !excluded.includes(option.id),
      );
      const selected = options[index % options.length];
      if (!selected || (group.min === 0 && index % 3 !== 0)) return [];
      return [
        {
          optionId: selected.id,
          quantity: group.kind === "quantity" ? Math.min(2, selected.maxQuantity, group.max) : 1,
        },
      ];
    }),
  };
}

/** 9月と10月を比較できる通常来店の合成履歴。既存の履歴は変更しない。 */
export async function seedPluginAnalytics(db: Database, store: Store, owner: Owner) {
  const previous = await db
    .select({ id: business.tableSessions.id })
    .from(business.tableSessions)
    .where(
      and(
        eq(business.tableSessions.store_id, store.id),
        like(business.tableSessions.id, `${store.id}-plugin-history-%`),
      ),
    );
  const existing = new Set(previous.map((row) => row.id));
  const products = store.configuration.products.filter((product) => product.available);
  const featured = (popular[store.id] ?? []).flatMap((key) =>
    products.filter((product) => product.id === `${store.id}-${key}`),
  );
  const drinks = products.filter((product) =>
    ["sake", "drinks", "craft-beer", "soft-drinks", "korean-alcohol"].includes(product.categoryId),
  );
  const dishes = products.filter((product) => !drinks.includes(product));
  if (!featured.length || !drinks.length || !dishes.length)
    throw new Error("分析seedに必要な料理と飲料がありません。");
  for (const period of tablecastAnalyticsPeriods) {
    for (let index = 0; index < period.sessions; index++) {
      const sessionId = `${store.id}-plugin-history-${period.month}-${String(index).padStart(3, "0")}`;
      if (existing.has(sessionId)) continue;
      // 10月31日は進行中なので、9月・10月とも1〜30日の営業を使う。
      const at =
        period.startsAt +
        Math.floor((index * 30) / period.sessions) * 86_400_000 +
        (index % 4) * 3_600_000;
      const closedAt = at + 90 * 60_000;
      const guestCount = 2 + (index % 4);
      const locale = index % 3 === 0 ? "en" : "ja";
      const rule = index % 10 === 0 ? store.configuration.plans[0] : undefined;
      const plan: null | PlanContext = rule
        ? {
            id: rule.id,
            startedAt: at,
            rules: rule,
            guestCount,
            orderedQuantity: 0,
            lastOrderAt: null,
          }
        : null;
      const statements: (BatchItem<"sqlite"> | SeedEvent)[] = [
        db.insert(business.tableSessions).values({
          id: sessionId,
          store_id: store.id,
          table_id: `${store.id}-table-${String((index % store.tableCount) + 1).padStart(2, "0")}`,
          status: "closed",
          locale,
          guest_count: guestCount,
          cart_version: 5,
          plan_json: plan
            ? JSON.stringify({ id: plan.id, startedAt: at, rules: plan.rules })
            : null,
          opened_at: at,
          closed_at: closedAt,
        }),
        event(store.id, sessionId, "table.opened", { guestCount, locale }, at, true),
      ];
      let total = rule ? rule.pricePerPerson * guestCount : 0;
      for (let round = 0; round < 4; round++) {
        const pool =
          round === 0 ? featured : round === 1 ? dishes : round === 2 ? drinks : products;
        // 10月は人気料理への注文が増える。残りの枠は全商品を巡回する。
        const offset =
          round === 0 && period.month === "2026-10" ? Math.floor(index / 2) : index + round * 7;
        const product = pool[offset % pool.length];
        if (!product) throw new Error("分析seedの商品がありません。");
        const line = lineFor(product, index + round, plan?.rules.excludedOptionIds);
        const orderedAt = at + (round * 12 + 1) * 60_000;
        const snapshot = snapshotFor(store, sessionId, [line], round + 1, locale, orderedAt, plan);
        const cancelled = round === 3 && index % 13 === 0;
        if (!cancelled) total += snapshot.total;
        if (plan && !cancelled) {
          plan.orderedQuantity += line.quantity;
          plan.lastOrderAt = orderedAt;
        }
        statements.push(
          confirmation(db, store.id, snapshot, orderedAt),
          order(db, store.id, snapshot, cancelled ? "cancelled" : "served", orderedAt),
          event(
            store.id,
            sessionId,
            "order.submitted",
            { orderId: `${snapshot.id}-order`, total: snapshot.total },
            orderedAt,
            true,
          ),
          event(
            store.id,
            sessionId,
            "order.status",
            { orderId: `${snapshot.id}-order`, status: cancelled ? "cancelled" : "served" },
            orderedAt + 60_000,
            true,
          ),
        );
      }
      const adjustment = index % 11 === 0 ? -100 : 0;
      const refund = index % 17 === 0 ? -200 : 0;
      total += adjustment;
      statements.push(
        payment(db, store.id, sessionId, owner.userId, total - refund, closedAt - 3000),
      );
      for (const [kind, amount] of [
        ["adjustment", adjustment],
        ["payment", refund],
      ] as const) {
        if (!amount) continue;
        statements.push(
          db.insert(business.payments).values({
            id: `${sessionId}-${kind}-correction`,
            store_id: store.id,
            table_session_id: sessionId,
            idempotency_key: `${sessionId}-${kind}-correction`,
            kind,
            amount,
            reason: "合成seedの会計訂正",
            actor_id: owner.userId,
            created_at: closedAt - 2000,
          }),
        );
      }
      if (index % 5 === 0)
        statements.push(event(store.id, sessionId, "staff.called", {}, at + 2 * 60_000, true));
      statements.push(
        event(store.id, sessionId, "bill.requested", {}, closedAt - 5 * 60_000, true),
        event(store.id, sessionId, "billing.payment", { amount: total }, closedAt - 1000, true),
        event(store.id, sessionId, "table.closed", {}, closedAt, true),
      );
      await insertSession(db, statements);
    }
  }
}
