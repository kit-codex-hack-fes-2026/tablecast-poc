import { business } from "@tablecast/api/db";
import { eq, sql } from "drizzle-orm";
import { DatabaseSync } from "node:sqlite";
import { inspect } from "node:util";
import { afterEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { deploymentDatabase } from "./tablecast-deploy-api.ts";
import {
  deploymentTarget,
  tablecastAccountId,
  tablecastRepository,
} from "./tablecast-deploy-config.ts";

const target = deploymentTarget("343");
const databaseId = "11111111-1111-4111-8111-111111111111";
const valueSchema = z.union([z.string(), z.number(), z.null()]);
const owner = { repository: tablecastRepository, environment: target.web, seeded: 0 };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function management(
  sqlite: DatabaseSync,
  exists = false,
  bucketOwner?: {
    databaseId: string;
    environment: string;
    repository: string;
  },
) {
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "tablecast-management-test-secret");
  vi.stubEnv("TABLECAST_DEPLOY_ENV", "preview");
  vi.stubEnv("TABLECAST_PR_NUMBER", "343");
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input, init) => {
    const url = requestUrl(input);
    const path = url.pathname.split(`/accounts/${tablecastAccountId}/`)[1];
    let result: unknown;
    if (path === "d1/database" && init?.method === "GET")
      result = exists ? [{ uuid: databaseId, name: target.database }] : [];
    else if (path === "d1/database" && init?.method === "POST")
      result = { uuid: databaseId, name: target.database };
    else if (path === "r2/buckets")
      result = { buckets: bucketOwner ? [{ name: target.bucket }] : [] };
    else if (path === `d1/database/${databaseId}/raw`) {
      const querySchema = z.object({ sql: z.string(), params: z.array(valueSchema) });
      const body = z
        .union([querySchema, z.object({ batch: z.array(querySchema) })])
        .parse(JSON.parse(z.string().parse(init?.body)));
      const batch = "batch" in body;
      if (batch) sqlite.exec("BEGIN");
      try {
        result = (batch ? body.batch : [body]).map((query) => {
          const before = z
            .object({ changes: z.number() })
            .parse(sqlite.prepare("SELECT total_changes() AS changes").get());
          const statement = sqlite.prepare(query.sql);
          statement.setReturnArrays(true);
          const rows = z.array(z.array(valueSchema)).parse(statement.all(...query.params));
          const after = z
            .object({ changes: z.number() })
            .parse(sqlite.prepare("SELECT total_changes() AS changes").get());
          const changes = after.changes - before.changes;
          return {
            success: true,
            meta: {
              duration: 0,
              size_after: 0,
              rows_read: rows.length,
              rows_written: changes,
              last_row_id: 0,
              changed_db: changes > 0,
              changes,
            },
            results: { columns: statement.columns().map((column) => column.name), rows },
          };
        });
        if (batch) sqlite.exec("COMMIT");
      } catch (error) {
        if (batch) sqlite.exec("ROLLBACK");
        throw error;
      }
    } else if (path?.startsWith(`r2/buckets/${target.bucket}/objects/`))
      return Response.json(bucketOwner);
    else throw new Error(`未定義の管理API: ${init?.method} ${path}`);
    return Response.json({ success: true, result });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function requestUrl(input: Parameters<typeof fetch>[0]) {
  return new URL(typeof input === "string" || input instanceof URL ? input : input.url);
}

async function resources(create: boolean) {
  vi.resetModules();
  return (await import("./tablecast-deploy/resources.ts")).resources(create);
}

describe("D1管理APIのRC版Drizzle接続", () => {
  test("実SQLiteのbatchで更新meta・読取・失敗時のロールバックを維持する", async () => {
    using sqlite = new DatabaseSync(":memory:");
    management(sqlite);
    const db = deploymentDatabase(databaseId);
    await db.run(
      sql`CREATE TABLE tablecast_deployment_owner(repository TEXT PRIMARY KEY, environment TEXT NOT NULL, seeded INTEGER NOT NULL DEFAULT 0)`,
    );
    await db.insert(business.deploymentOwner).values(owner);
    const [updated, selected] = await db.batch([
      db.update(business.deploymentOwner).set({ seeded: 1 }),
      db.select().from(business.deploymentOwner),
    ]);
    expect(updated.meta.changes).toBe(1);
    expect(selected).toEqual([{ ...owner, seeded: 1 }]);
    await expect(
      db.batch([
        db.update(business.deploymentOwner).set({ seeded: 0 }),
        db.insert(business.deploymentOwner).values(owner),
      ]),
    ).rejects.toThrow("UNIQUE constraint failed");
    expect(await db.select().from(business.deploymentOwner)).toEqual([{ ...owner, seeded: 1 }]);
  });

  test("実SQLiteの挿入・型変換・配列とオブジェクト形式・空のgetを維持する", async () => {
    using sqlite = new DatabaseSync(":memory:");
    const fetch = management(sqlite);
    const db = deploymentDatabase(databaseId);
    await db.run(
      sql`CREATE TABLE tablecast_deployment_owner(repository TEXT NOT NULL, environment TEXT NOT NULL, seeded INTEGER NOT NULL DEFAULT 0)`,
    );
    await db.insert(business.deploymentOwner).values(owner);
    expect(await db.select().from(business.deploymentOwner)).toEqual([owner]);
    expect(await db.select().from(business.deploymentOwner).get()).toEqual(owner);
    expect(
      await db
        .select()
        .from(business.deploymentOwner)
        .where(eq(business.deploymentOwner.seeded, 1))
        .get(),
    ).toBeUndefined();
    const query = sql`SELECT ${"卓"} AS label, ${3} AS amount, NULL AS missing`;
    expect(await db.all(query, "arrays")).toEqual([["卓", 3, null]]);
    expect(await db.all(query)).toEqual([{ label: "卓", amount: 3, missing: null }]);
    expect(await db.get(query, "arrays")).toEqual(["卓", 3, null]);
    expect(await db.get(query)).toEqual({ label: "卓", amount: 3, missing: null });
    expect(await db.all(sql`SELECT 1 AS duplicate, 2 AS duplicate`, "arrays")).toEqual([[1, 2]]);
    expect(await db.get(sql`SELECT 1 WHERE 0`)).toBeUndefined();
    expect(
      fetch.mock.calls.every(
        ([input, init]) =>
          requestUrl(input).pathname.endsWith(`/d1/database/${databaseId}/raw`) &&
          init?.method === "POST",
      ),
    ).toBe(true);
  });

  test.each([
    { result: [] },
    { result: [{ success: false, results: { columns: [], rows: [] } }] },
    { result: [{ success: true, results: { columns: ["value"], rows: [[1, 2]] } }] },
    { result: [{ success: true, results: { columns: ["value"], rows: [[{}]] } }] },
  ])("壊れた応答を空の成功結果に変換しない: $result", async ({ result }) => {
    const db = deploymentDatabase(databaseId, async () => result);
    await expect(db.all(sql`SELECT ${"tablecast-parameter-secret"}`)).rejects.toThrow(
      "Failed query",
    );
  });

  test("管理APIの失敗を表示してもtoken・SQLパラメーター・応答本文を含めない", async () => {
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "tablecast-api-token-secret");
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(new Response("tablecast-response-secret", { status: 403 })),
    );
    const db = deploymentDatabase(databaseId);
    const error: unknown = await db
      .all(sql`SELECT ${"tablecast-parameter-secret"}`)
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    const output = inspect(error, { depth: null }) + JSON.stringify(error);
    expect(output).not.toMatch(/tablecast-(api-token|response|parameter)-secret/);
    expect(output).toContain("403");
  });

  test("新規previewへ所有情報を初期投入し、同じ資源の再実行では変更しない", async () => {
    using sqlite = new DatabaseSync(":memory:");
    management(sqlite);
    expect(await resources(true)).toEqual({
      database: { uuid: databaseId, name: target.database },
      bucketExists: false,
      bucketCreated: true,
    });
    const db = deploymentDatabase(databaseId);
    expect(await db.select().from(business.deploymentOwner)).toEqual([owner]);
    const fetch = management(sqlite, true, { ...owner, databaseId });
    expect(await resources(true)).toMatchObject({ bucketExists: true, bucketCreated: false });
    expect(
      fetch.mock.calls.every(
        ([input, init]) => init?.method === "GET" || requestUrl(input).pathname.endsWith("/raw"),
      ),
    ).toBe(true);
  });

  test.each([
    { repository: "other/tablecast", environment: target.web },
    { repository: tablecastRepository, environment: "tablecast-pr-344" },
  ])("別repository・環境のD1ならR2を作成せず拒否する: %j", async (foreign) => {
    using sqlite = new DatabaseSync(":memory:");
    const fetch = management(sqlite, true);
    const db = deploymentDatabase(databaseId);
    await db.run(
      sql`CREATE TABLE tablecast_deployment_owner(repository TEXT NOT NULL, environment TEXT NOT NULL, seeded INTEGER NOT NULL DEFAULT 0)`,
    );
    await db.insert(business.deploymentOwner).values(foreign);
    fetch.mockClear();
    await expect(resources(true)).rejects.toThrow("D1の所有情報が一致しません");
    expect(
      fetch.mock.calls.some(
        ([input, init]) =>
          requestUrl(input).pathname.endsWith("/r2/buckets") && init?.method === "POST",
      ),
    ).toBe(false);
    expect(await db.select().from(business.deploymentOwner)).toEqual([{ ...foreign, seeded: 0 }]);
  });

  test.each([
    { ...owner, repository: "other/tablecast", databaseId },
    { ...owner, environment: "tablecast-pr-344", databaseId },
    { ...owner, databaseId: "22222222-2222-4222-8222-222222222222" },
  ])("D1の所有が正しくても別repository・環境・DBのR2を採用しない: %j", async (bucketOwner) => {
    using sqlite = new DatabaseSync(":memory:");
    const fetch = management(sqlite, true, bucketOwner);
    const db = deploymentDatabase(databaseId);
    await db.run(
      sql`CREATE TABLE tablecast_deployment_owner(repository TEXT NOT NULL, environment TEXT NOT NULL, seeded INTEGER NOT NULL DEFAULT 0)`,
    );
    await db.insert(business.deploymentOwner).values(owner);
    fetch.mockClear();
    await expect(resources(true)).rejects.toThrow("R2の所有情報が一致しません");
    expect(
      fetch.mock.calls.every(
        ([input, init]) => init?.method === "GET" || requestUrl(input).pathname.endsWith("/raw"),
      ),
    ).toBe(true);
    expect(await db.select().from(business.deploymentOwner)).toEqual([owner]);
  });
});
