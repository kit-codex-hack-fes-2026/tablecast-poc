import { business, type Database } from "@tablecast/api/db";
import { count, like, sql } from "drizzle-orm";

export async function seedCounts(db: Database) {
  const violations = await db.all(sql`PRAGMA foreign_key_check`);
  if (violations.length) throw new Error("デモデータの外部キーが不整合です。");
  const [stores, tables, historicalSessions, orders, events] = await db.batch([
    db.select({ count: count() }).from(business.stores),
    db.select({ count: count() }).from(business.restaurantTables),
    db
      .select({ count: count() })
      .from(business.tableSessions)
      .where(like(business.tableSessions.id, "%-history-%")),
    db.select({ count: count() }).from(business.orders),
    db.select({ count: count() }).from(business.tableEvents),
  ]);
  return {
    stores: stores[0]?.count ?? 0,
    tables: tables[0]?.count ?? 0,
    historicalSessions: historicalSessions[0]?.count ?? 0,
    orders: orders[0]?.count ?? 0,
    events: events[0]?.count ?? 0,
  };
}
