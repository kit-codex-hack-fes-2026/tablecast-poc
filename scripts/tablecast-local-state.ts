import { getPlatformProxy } from "wrangler";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const legacyId = "00000000-0000-0000-0000-000000000000";
export const tablecastLocalDatabaseId = "00000000-0000-4000-8000-000000000000";
const identifier = (name: string) => `"${name.replaceAll('"', '""')}"`;

// cfが要求するUUIDv4へlocal D1だけを移す。旧state・R2・DO・migration履歴は残す。
// schemaとデータの移送は公式SDKのD1 batchで行い、SQLiteファイルを直接編集しない。
export async function migrateLocalDatabase(state: string, marker: string) {
  try {
    if (JSON.parse(await readFile(marker, "utf8")).databaseId === tablecastLocalDatabaseId) return;
    throw new Error("local D1移行記録が別のDBを参照しています。");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const directory = await mkdtemp(join(tmpdir(), "tablecast-cf-state-"));
  const configPath = join(directory, "wrangler.json");
  await writeFile(
    configPath,
    JSON.stringify({
      name: "tablecast-local-state-migration",
      compatibility_date: "2026-09-03",
      d1_databases: [
        {
          binding: "TABLECAST_LEGACY_DB",
          database_id: legacyId,
          database_name: "tablecast-legacy-local",
        },
        {
          binding: "TABLECAST_DB",
          database_id: tablecastLocalDatabaseId,
          database_name: "tablecast-local",
        },
      ],
    }),
  );
  const platform = await getPlatformProxy<{
    TABLECAST_LEGACY_DB: D1Database;
    TABLECAST_DB: D1Database;
  }>({ configPath, persist: { path: join(state, "v3") }, remoteBindings: false });
  try {
    const { TABLECAST_LEGACY_DB: previous, TABLECAST_DB: next } = platform.env;
    const schemaQuery =
      "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name";
    const schema = z
      .array(z.object({ type: z.string(), name: z.string(), sql: z.string() }))
      .parse((await previous.prepare(schemaQuery).all()).results);
    if (!schema.length) return;
    if ((await next.prepare(schemaQuery).all()).results.length)
      throw new Error("旧・新local D1が両方存在します。自動上書きせず移行状態を照合してください。");
    const statements = [next.prepare("PRAGMA defer_foreign_keys = ON")];
    statements.push(
      ...schema.filter((entry) => entry.type === "table").map((entry) => next.prepare(entry.sql)),
    );
    const counts: Record<string, number> = {};
    for (const table of schema.filter((entry) => entry.type === "table")) {
      const columns = z
        .array(z.object({ name: z.string() }))
        .parse(
          (await previous.prepare(`PRAGMA table_info(${identifier(table.name)})`).all()).results,
        );
      const values = (
        await previous
          .prepare(
            `SELECT ${columns.map(({ name }) => `quote(${identifier(name)}) AS ${identifier(name)}`).join(",")} FROM ${identifier(table.name)}`,
          )
          .all()
      ).results;
      counts[table.name] = values.length;
      for (const row of values) {
        const literals = columns.map(({ name }) => z.string().parse(row[name]));
        statements.push(
          next.prepare(
            `INSERT INTO ${identifier(table.name)} (${columns.map(({ name }) => identifier(name)).join(",")}) VALUES (${literals.join(",")})`,
          ),
        );
      }
    }
    statements.push(
      ...schema.filter((entry) => entry.type !== "table").map((entry) => next.prepare(entry.sql)),
    );
    await next.batch(statements);
    for (const [table, count] of Object.entries(counts)) {
      const row = z
        .object({ count: z.number() })
        .parse(await next.prepare(`SELECT count(*) AS count FROM ${identifier(table)}`).first());
      if (row.count !== count) throw new Error("local D1移行後の件数が一致しません。");
    }
    if ((await next.prepare("PRAGMA foreign_key_check").all()).results.length)
      throw new Error("local D1移行後の外部キーが一致しません。");
    await writeFile(
      marker,
      JSON.stringify({ databaseId: tablecastLocalDatabaseId, tables: Object.keys(counts).length }),
      { mode: 0o600 },
    );
    console.info(
      "旧local D1のデータとmigration履歴をcf用IDへ移しました。旧stateは保持しています。",
    );
  } catch (error) {
    if (
      error instanceof Error &&
      [
        "旧・新local D1が両方存在します。自動上書きせず移行状態を照合してください。",
        "local D1移行後の件数が一致しません。",
        "local D1移行後の外部キーが一致しません。",
      ].includes(error.message)
    )
      throw error;
    // SDKのSQL例外は認証データを含み得るため、元のquery・causeを表示しない。
    // oxlint-disable-next-line eslint/preserve-caught-error -- causeへSQLの認証データを残すとCLIが表示するため。
    throw new Error("local D1移行に失敗しました。旧stateを保持して移行状態を照合してください。");
  } finally {
    await platform.dispose();
    await rm(directory, { recursive: true, force: true });
  }
}
