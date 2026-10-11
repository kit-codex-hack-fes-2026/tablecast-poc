import { expect, test } from "vitest";
import { getPlatformProxy } from "wrangler";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateLocalDatabase, tablecastLocalDatabaseId } from "./tablecast-local-state";

test("新規stateでは設定生成にDB runtimeや移行記録を作らない", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tablecast-cf-empty-state-"));
  try {
    const state = join(directory, "state");
    const marker = join(directory, "migration.json");
    await migrateLocalDatabase(state, marker);
    await expect(stat(state)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(marker)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("旧local D1の大きいTEXT・参照・BLOB・migration履歴を保持し再実行で書込みを繰り返さない", async () => {
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
  const largeValue = "TableCast\0'".repeat(20_000);
  try {
    const previous = await open("00000000-0000-0000-0000-000000000000");
    try {
      // migration fixtureで、依存順が逆の参照とBLOBの保存を確認する。
      await previous.env.TABLECAST_DB.exec(
        "CREATE TABLE z_parent(id INTEGER PRIMARY KEY, payload BLOB, code TEXT); CREATE UNIQUE INDEX z_parent_code ON z_parent(code); CREATE TABLE a_child(id INTEGER REFERENCES z_parent(id), value TEXT, parent_code TEXT REFERENCES z_parent(code)); CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY, name TEXT); INSERT INTO z_parent VALUES(1,x'00ff','tablecast-parent'); INSERT INTO a_child VALUES(1,'TableCast','tablecast-parent'); INSERT INTO d1_migrations VALUES(1,'0001.sql');",
      );
      await previous.env.TABLECAST_DB.prepare("UPDATE a_child SET value = ?")
        .bind(largeValue)
        .run();
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
      ).toEqual({ value: largeValue, payload: "00FF" });
      expect(await next.env.TABLECAST_DB.prepare("SELECT name FROM d1_migrations").first()).toEqual(
        { name: "0001.sql" },
      );
      await next.env.TABLECAST_DB.exec("INSERT INTO z_parent VALUES(2,x'0102','tablecast-next')");
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
