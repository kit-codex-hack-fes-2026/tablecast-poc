import { beforeEach, describe, expect, test, vi } from "vitest";
import { currentRevision } from "./tablecast-deploy-api.ts";
import { deploymentTarget, tablecastRepository } from "./tablecast-deploy-config.ts";

const execute = vi.hoisted(() =>
  vi.fn<(file: string, args: string[]) => Promise<{ stderr: string; stdout: string }>>(),
);
vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  return { execFile: Object.assign(vi.fn(), { [promisify.custom]: execute }) };
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
