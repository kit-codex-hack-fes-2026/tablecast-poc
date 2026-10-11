import { expect, test } from "vitest";
import { getPlatformProxy } from "wrangler";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateLocalDatabase, tablecastLocalDatabaseId } from "./tablecast-local-state";

test("旧local D1の参照・BLOB・migration履歴を保持し再実行で書込みを繰り返さない", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tablecast-cf-state-test-"));
  const state = join(directory, "state");
  const marker = join(directory, "migration.json");
  const configPath = join(directory, "wrangler.json");
  const open = async (id: string) => {
    await writeFile(
      configPath,
      JSON.stringify({
        name: "tablecast-state-test",
        compatibility_date: "2026-09-03",
        d1_databases: [
          { binding: "TABLECAST_DB", database_id: id, database_name: "tablecast-state-test" },
        ],
      }),
    );
    return getPlatformProxy<{ TABLECAST_DB: D1Database }>({
      configPath,
      persist: { path: join(state, "v3") },
      remoteBindings: false,
    });
  };
  try {
    const previous = await open("00000000-0000-0000-0000-000000000000");
    try {
      // migration fixtureで、依存順が逆の参照とBLOBの保存を確認する。
      await previous.env.TABLECAST_DB.exec(
        "CREATE TABLE z_parent(id INTEGER PRIMARY KEY, payload BLOB); CREATE TABLE a_child(id INTEGER REFERENCES z_parent(id), value TEXT); CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY, name TEXT); INSERT INTO z_parent VALUES(1,x'00ff'); INSERT INTO a_child VALUES(1,'TableCast'); INSERT INTO d1_migrations VALUES(1,'0001.sql');",
      );
    } finally {
      await previous.dispose();
    }
    await migrateLocalDatabase(state, marker);
    expect(JSON.parse(await readFile(marker, "utf8"))).toMatchObject({
      databaseId: tablecastLocalDatabaseId,
      tables: 3,
    });
    const next = await open(tablecastLocalDatabaseId);
    try {
      expect(
        await next.env.TABLECAST_DB.prepare(
          "SELECT a.value, hex(z.payload) AS payload FROM a_child a JOIN z_parent z ON z.id=a.id",
        ).first(),
      ).toEqual({ value: "TableCast", payload: "00FF" });
      expect(await next.env.TABLECAST_DB.prepare("SELECT name FROM d1_migrations").first()).toEqual(
        { name: "0001.sql" },
      );
      await next.env.TABLECAST_DB.exec("INSERT INTO z_parent VALUES(2,x'0102')");
    } finally {
      await next.dispose();
    }
    await migrateLocalDatabase(state, marker);
    const preserved = await open("00000000-0000-0000-0000-000000000000");
    try {
      expect(
        await preserved.env.TABLECAST_DB.prepare("SELECT count(*) AS count FROM z_parent").first(),
      ).toEqual({ count: 1 });
    } finally {
      await preserved.dispose();
    }
    await rm(marker);
    await expect(migrateLocalDatabase(state, marker)).rejects.toThrow("両方存在");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);
