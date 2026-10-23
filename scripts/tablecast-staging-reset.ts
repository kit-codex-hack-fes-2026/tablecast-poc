import { isHostedEmulator } from "@tablecast/api/bootstrap";
import { business, createDatabase, identity } from "@tablecast/api/db";
import { is, sql } from "drizzle-orm";
import { SQLiteTable } from "drizzle-orm/sqlite-core";

export async function resetStagingDatabase(
  env: Pick<TablecastEnv, "TABLECAST_DB" | "TABLECAST_ENV" | "TABLECAST_PUBLIC_ORIGIN">,
) {
  if (env.TABLECAST_ENV !== "staging" || !isHostedEmulator(env))
    throw new Error("staging以外はリセットできません。");
  const db = createDatabase(env.TABLECAST_DB);
  const owner = await db.select().from(business.deploymentOwner);
  if (
    owner.length !== 1 ||
    owner[0]?.repository !== "kit-codex-hack-fes-2026/tablecast-poc" ||
    owner[0].environment !== "tablecast-staging"
  )
    throw new Error("stagingのDB所有情報が一致しません。");
  const tables = [...Object.values(identity), ...Object.values(business)].flatMap((table) =>
    is(table, SQLiteTable) && table !== business.deploymentOwner ? [table] : [],
  );
  // D1の同一batch内で参照を遅延検証する。migrationと所有台帳は残す。
  await db.batch([
    db.run(sql`PRAGMA defer_foreign_keys = ON`),
    ...tables.map((table) => db.delete(table).where(sql`1 = 1`)),
    db
      .update(business.deploymentOwner)
      .set({ seeded: 0 })
      .where(sql`1 = 1`),
    db.run(sql`PRAGMA defer_foreign_keys = OFF`),
  ]);
}
