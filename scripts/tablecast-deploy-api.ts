import { drizzle, type SqliteProxyBatchItem } from "drizzle-orm/sqlite-proxy";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import {
  type deploymentTarget,
  tablecastAccountId,
  tablecastRepository,
} from "./tablecast-deploy-config.ts";
const execFileAsync = promisify(execFile);
const responseSchema = z.object({ success: z.boolean(), result: z.unknown() });
const databaseResponseSchema = z.array(
  z.object({
    success: z.literal(true),
    meta: z.unknown(),
    results: z.object({
      columns: z.array(z.string()),
      rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))),
    }),
  }),
);
const databaseMetaSchema = z
  .object({
    duration: z.number(),
    size_after: z.number(),
    rows_read: z.number(),
    rows_written: z.number(),
    last_row_id: z.number(),
    changed_db: z.boolean(),
    changes: z.number(),
  })
  .passthrough();

async function cloudflareResponse(path: string, method = "GET", body?: unknown) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token)
    throw new Error("CLOUDFLARE_API_TOKENを環境変数またはActions secretへ登録してください。");
  return fetch(`https://api.cloudflare.com/client/v4/accounts/${tablecastAccountId}/${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
}

export async function cloudflare(
  path: string,
  method = "GET",
  body?: unknown,
  allowMissing = false,
) {
  const response = await cloudflareResponse(path, method, body);
  if (allowMissing && response.status === 404) return undefined;
  if (!response.ok)
    throw new Error(`Cloudflare ${method} ${path.split("?")[0]}: HTTP ${response.status}`);
  const data = responseSchema.parse(await response.json());
  if (!data.success) throw new Error(`Cloudflare ${method} ${path.split("?")[0]}に失敗しました。`);
  return data.result;
}

export function deploymentDatabase(databaseId: string, request = cloudflare) {
  async function execute(body: unknown, expected: number) {
    const results = databaseResponseSchema.parse(
      await request(`d1/database/${databaseId}/raw`, "POST", body),
    );
    if (results.length !== expected) throw new Error("D1の結果件数が一致しません。");
    for (const { results: result } of results)
      if (result.rows.some((row) => row.length !== result.columns.length))
        throw new Error("D1の列と行の数が一致しません。");
    return results;
  }
  type Result = z.infer<typeof databaseResponseSchema>[number];
  function readRows({ results: { columns, rows } }: Result, rowMode?: "array" | "object") {
    return rowMode === "object"
      ? rows.map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index]])))
      : rows;
  }
  function runResult(result: Result): D1Result {
    return {
      success: true,
      meta: databaseMetaSchema.parse(result.meta),
      results: readRows(result, "object"),
    };
  }
  async function single(query: string, params: unknown[]) {
    const [result] = await execute({ sql: query, params }, 1);
    if (!result) throw new Error("D1の結果がありません。");
    return result;
  }
  function all(query: string, params: unknown[], rowMode?: "array"): Promise<unknown[][]>;
  function all(
    query: string,
    params: unknown[],
    rowMode: "object",
  ): Promise<Record<string, unknown>[]>;
  function all(
    query: string,
    params: unknown[],
    rowMode?: "array" | "object",
  ): Promise<(Record<string, unknown> | unknown[])[]>;
  async function all(
    query: string,
    params: unknown[],
    rowMode?: "array" | "object",
  ): Promise<(Record<string, unknown> | unknown[])[]> {
    return readRows(await single(query, params), rowMode);
  }
  function get(query: string, params: unknown[], rowMode?: "array"): Promise<undefined | unknown[]>;
  function get(
    query: string,
    params: unknown[],
    rowMode: "object",
  ): Promise<Record<string, unknown> | undefined>;
  function get(
    query: string,
    params: unknown[],
    rowMode?: "array" | "object",
  ): Promise<Record<string, unknown> | undefined | unknown[]>;
  async function get(query: string, params: unknown[], rowMode?: "array" | "object") {
    return (await all(query, params, rowMode))[0];
  }
  async function run(query: string, params: unknown[]) {
    return runResult(await single(query, params));
  }
  async function batch(queries: SqliteProxyBatchItem[]) {
    // D1 RESTの一括実行で、CASとchanges()の連鎖・ロールバックを保つ。
    const results = await execute(
      { batch: queries.map(({ sql, params }) => ({ sql, params })) },
      queries.length,
    );
    return results.map((result, index) => {
      const query = queries[index];
      if (!query) throw new Error("D1のbatch入力がありません。");
      if (query.method === "run") return runResult(result);
      const values = readRows(result, query.rowMode);
      return query.method === "get" ? values[0] : values;
    });
  }
  return drizzle({ all, get, run, batch }, { paramsInErrors: false });
}

export async function readBucketOwner(bucket: string) {
  const response = await cloudflareResponse(
    `r2/buckets/${bucket}/objects/${encodeURIComponent("tablecast/deployment-owner.json")}`,
  );
  if (!response.ok) throw new Error(`R2の所有情報を読み取れません: HTTP ${response.status}`);
  return z
    .object({ repository: z.string(), environment: z.string(), databaseId: z.uuid() })
    .parse(await response.json());
}

export async function currentRevision(
  target: ReturnType<typeof deploymentTarget>,
  sha: string,
  cleanup = false,
) {
  const gh = await execFileAsync("gh", [
    "api",
    target.pr
      ? `repos/${tablecastRepository}/pulls/${target.pr}`
      : `repos/${tablecastRepository}/commits/${target.branch}`,
    "--jq",
    target.pr
      ? "{state, head: {sha: .head.sha, repo: {full_name: .head.repo.full_name}}}"
      : "{sha}",
  ]);
  const value: unknown = JSON.parse(gh.stdout);
  if (target.pr) {
    const pr = z
      .object({
        state: z.string(),
        head: z.object({ sha: z.string(), repo: z.object({ full_name: z.string() }) }),
      })
      .parse(value);
    if (
      pr.head.repo.full_name !== tablecastRepository ||
      pr.state !== (cleanup ? "closed" : "open") ||
      (!cleanup && pr.head.sha !== sha)
    )
      throw new Error("PRが更新・終了したか、同一リポジトリのPRではありません。");
  } else if (z.object({ sha: z.string() }).parse(value).sha !== sha) {
    throw new Error("配備対象branchが更新されました。新しいCIの配備に任せます。");
  }
}

export async function waitForRelease(
  origin: string,
  headers: Record<string, string>,
  releaseSha: string,
) {
  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      const response = await fetch(`${origin}/api/health`, {
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(5_000),
      });
      const health = z.object({ releaseSha: z.string() }).safeParse(await response.json());
      if (response.ok && health.success && health.data.releaseSha === releaseSha) return;
      console.info(`配備の反映待ち ${attempt}/12: HTTP ${response.status}`);
    } catch {
      // 一時的な接続失敗やHTML応答は再試行し、資格を含み得る応答本文は出さない。
      console.info(`配備の反映待ち ${attempt}/12: healthを取得できません。`);
    }
    if (attempt < 12) await new Promise((complete) => setTimeout(complete, 5_000));
  }
  throw new Error("配備先のrelease SHAを期限内に確認できません。");
}
