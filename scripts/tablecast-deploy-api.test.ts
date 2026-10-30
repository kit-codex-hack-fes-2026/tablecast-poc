import { business } from "@tablecast/api/db";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { currentRevision, deploymentDatabase } from "./tablecast-deploy-api.ts";
import { deploymentTarget, tablecastRepository } from "./tablecast-deploy-config.ts";

const execute = vi.hoisted(() =>
  vi.fn<(file: string, args: string[]) => Promise<{ stderr: string; stdout: string }>>(),
);
vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  return { execFile: Object.assign(vi.fn(), { [promisify.custom]: execute }) };
});

describe("配備用D1 REST接続", () => {
  const meta = {
    duration: 1,
    size_after: 4096,
    rows_read: 1,
    rows_written: 0,
    last_row_id: 0,
    changed_db: false,
    changes: 0,
  };
  function result(columns: string[], rows: (null | number | string)[][], changes = 0) {
    return {
      success: true,
      meta: { ...meta, changes, changed_db: changes > 0 },
      results: { columns, rows },
    };
  }

  test("単一のselect・get・生のallをDrizzleの結果へ戻す", async () => {
    const request = vi
      .fn<(path: string, method?: string, body?: unknown) => Promise<unknown>>()
      .mockResolvedValue([
        {
          success: true,
          results: result(
            ["repository", "environment", "seeded"],
            [["tablecast", "tablecast-staging", 1]],
          ).results,
        },
      ]);
    const db = deploymentDatabase("tablecast-test", request);
    expect(await db.select().from(business.deploymentOwner).get()).toEqual({
      repository: "tablecast",
      environment: "tablecast-staging",
      seeded: 1,
    });
    expect(
      await db.all(sql`SELECT repository, environment, seeded FROM tablecast_deployment_owner`),
    ).toEqual([{ repository: "tablecast", environment: "tablecast-staging", seeded: 1 }]);
  });

  test("更新と読取を一つのbatchへ送り、CASのchangesを保持する", async () => {
    const request = vi
      .fn<(path: string, method?: string, body?: unknown) => Promise<unknown>>()
      .mockResolvedValue([result([], [], 1), result(["seeded"], [[1]])]);
    const db = deploymentDatabase("tablecast-test", request);
    const [updated, selected] = await db.batch([
      db
        .update(business.deploymentOwner)
        .set({ seeded: 1 })
        .where(eq(business.deploymentOwner.repository, "tablecast's fixture")),
      db.select({ seeded: business.deploymentOwner.seeded }).from(business.deploymentOwner),
    ]);
    expect(updated.meta.changes).toBe(1);
    expect(selected).toEqual([{ seeded: 1 }]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.slice(0, 2)).toEqual(["d1/database/tablecast-test/raw", "POST"]);
    expect(request.mock.calls[0]?.[2]).toMatchObject({
      batch: [{ params: [1, "tablecast's fixture"] }, { params: [] }],
    });
  });

  test("件数・列・更新メタデータが欠けた応答を成功として扱わない", async () => {
    const request = vi
      .fn<(path: string, method?: string, body?: unknown) => Promise<unknown>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([result(["seeded"], [[1, 2]])])
      .mockResolvedValueOnce([{ success: true, results: { columns: [], rows: [] } }]);
    const db = deploymentDatabase("tablecast-test", request);
    await expect(db.select().from(business.deploymentOwner)).rejects.toThrow("Failed query");
    await expect(db.select().from(business.deploymentOwner)).rejects.toThrow("Failed query");
    await expect(db.update(business.deploymentOwner).set({ seeded: 1 })).rejects.toThrow(
      "Failed query",
    );
  });
});

const sha = "a".repeat(40);
beforeEach(() => {
  execute.mockReset();
});

describe("配備前のbranchとPRの確認", () => {
  test.each(["staging", "production"] as const)(
    "%sではpatchを出力せず現在のbranchのSHAだけを照合する",
    async (environment) => {
      execute.mockResolvedValue({ stdout: JSON.stringify({ sha }), stderr: "" });
      await expect(
        currentRevision(deploymentTarget(undefined, environment), sha),
      ).resolves.toBeUndefined();
      expect(execute).toHaveBeenCalledWith("gh", [
        "api",
        `repos/${tablecastRepository}/commits/${environment === "staging" ? "staging" : "main"}`,
        "--jq",
        "{sha}",
      ]);
    },
  );

  test("branchが更新されていれば配備を拒否する", async () => {
    execute.mockResolvedValue({ stdout: JSON.stringify({ sha: "b".repeat(40) }), stderr: "" });
    await expect(currentRevision(deploymentTarget(undefined, "staging"), sha)).rejects.toThrow(
      "配備対象branchが更新されました",
    );
  });

  test.each([
    {
      label: "openで同じSHAのPR",
      state: "open",
      headSha: sha,
      cleanup: false,
    },
    {
      label: "終了済みPRのcleanup",
      state: "closed",
      headSha: "b".repeat(40),
      cleanup: true,
    },
  ])("$labelでは確認に必要な情報だけを取得して許可する", async ({ state, headSha, cleanup }) => {
    execute.mockResolvedValue({
      stdout: JSON.stringify({
        state,
        head: { sha: headSha, repo: { full_name: tablecastRepository } },
      }),
      stderr: "",
    });
    await expect(currentRevision(deploymentTarget("365"), sha, cleanup)).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledWith("gh", [
      "api",
      `repos/${tablecastRepository}/pulls/365`,
      "--jq",
      "{state, head: {sha: .head.sha, repo: {full_name: .head.repo.full_name}}}",
    ]);
  });

  test.each([
    {
      label: "headが更新されたPR",
      state: "open",
      headSha: "b".repeat(40),
      repository: tablecastRepository,
      cleanup: false,
    },
    {
      label: "終了済みPRへの配備",
      state: "closed",
      headSha: sha,
      repository: tablecastRepository,
      cleanup: false,
    },
    {
      label: "forkのPRへの配備",
      state: "open",
      headSha: sha,
      repository: "other/tablecast-poc",
      cleanup: false,
    },
    {
      label: "再開したPRのcleanup",
      state: "open",
      headSha: sha,
      repository: tablecastRepository,
      cleanup: true,
    },
    {
      label: "forkのPRのcleanup",
      state: "closed",
      headSha: sha,
      repository: "other/tablecast-poc",
      cleanup: true,
    },
  ])("$labelを拒否する", async ({ state, headSha, repository, cleanup }) => {
    execute.mockResolvedValue({
      stdout: JSON.stringify({ state, head: { sha: headSha, repo: { full_name: repository } } }),
      stderr: "",
    });
    await expect(currentRevision(deploymentTarget("365"), sha, cleanup)).rejects.toThrow(
      "PRが更新・終了したか、同一リポジトリのPRではありません。",
    );
  });

  test("GitHubの確認に失敗したら配備もcleanupも拒否する", async () => {
    execute.mockRejectedValue(new Error("GitHub HTTP 403"));
    await expect(currentRevision(deploymentTarget(undefined, "staging"), sha)).rejects.toThrow(
      "403",
    );
    await expect(currentRevision(deploymentTarget("365"), sha, true)).rejects.toThrow("403");
  });
});
