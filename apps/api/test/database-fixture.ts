import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import type { SQLiteTable, SQLiteInsertValue } from "drizzle-orm/sqlite-core";

export const fixtureDb = drizzle(env.TABLECAST_DB);

// 型付きinsertを既存のD1 batchへ渡す。raw SQLを必要とする制約・競合試験とも同じtransactionを保つ。
export function insertFixture<T extends SQLiteTable>(
  table: T,
  value: SQLiteInsertValue<T> | SQLiteInsertValue<T>[],
) {
  const { sql, params } = fixtureDb
    .insert(table)
    .values(Array.isArray(value) ? value : [value])
    .toSQL();
  return env.TABLECAST_DB.prepare(sql).bind(...params);
}
