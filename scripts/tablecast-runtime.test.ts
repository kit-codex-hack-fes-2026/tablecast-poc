import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { assertLocalRuntime, localReleaseSha, worktreeHost, worktreeId } from "./tablecast-runtime";

beforeEach(async () => {
  // Git hookから継承した参照先を外し、fixture以外のリポジトリを操作しない。
  const { stdout } = await promisify(execFile)("git", ["rev-parse", "--local-env-vars"]);
  for (const name of stdout.trim().split("\n")) vi.stubEnv(name, undefined);
});

afterEach(() => vi.unstubAllEnvs());

it("起動版は実GitのHEADを使い未commitの変更を区別し無視対象を含めない", async () => {
  const root = await mkdtemp(join(tmpdir(), "tablecast-release-"));
  const execute = promisify(execFile);
  const git = (...args: string[]) => execute("git", args, { cwd: root });
  try {
    // 独立したリポジトリで実際の状態変化を確認する。
    await git("init", "--quiet");
    await writeFile(join(root, ".gitignore"), ".local\n");
    await git("add", ".gitignore");
    await git(
      "-c",
      "user.name=TableCast Test",
      "-c",
      "user.email=tablecast@example.invalid",
      "-c",
      "commit.gpgSign=false",
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "--quiet",
      "-m",
      "tablecast fixture",
    );
    const { stdout } = await git("rev-parse", "HEAD");
    const sha = stdout.trim();
    expect(await localReleaseSha(root)).toBe(sha);
    await writeFile(join(root, ".local"), "tablecast ignored fixture");
    expect(await localReleaseSha(root)).toBe(sha);
    await writeFile(join(root, "tablecast-new.txt"), "tablecast fixture");
    expect(await localReleaseSha(root)).toBe(`${sha}-dirty`);
    await rm(join(root, "tablecast-new.txt"));
    await writeFile(join(root, ".gitignore"), ".local\n.tablecast-test\n");
    expect(await localReleaseSha(root)).toBe(`${sha}-dirty`);
    await git("add", ".gitignore");
    expect(await localReleaseSha(root)).toBe(`${sha}-dirty`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

describe("開発資源の所有境界", () => {
  it("mainとdetached worktreeでDev Containerにも同じrepo付きドメインを渡す", async () => {
    const parent = await mkdtemp(join(tmpdir(), "tablecast-container-"));
    const repository = join(parent, "Tablecast_PoC");
    const linked = join(parent, "Voice_UI");
    const execute = promisify(execFile);
    try {
      await mkdir(repository);
      const git = (...args: string[]) => execute("git", ["-C", repository, ...args]);
      await git("init", "--quiet");
      await git(
        "-c",
        "user.name=TableCast Test",
        "-c",
        "user.email=tablecast@example.invalid",
        "-c",
        "commit.gpgSign=false",
        "-c",
        "core.hooksPath=/dev/null",
        "commit",
        "--allow-empty",
        "--quiet",
        "-m",
        "tablecast fixture",
      );
      await git("worktree", "add", "--detach", linked);
      for (const [root, name] of [
        [repository, "main"],
        [linked, "voice-ui"],
      ] as const) {
        await mkdir(join(root, ".devcontainer"));
        await execute("sh", [".devcontainer/tablecast-init.sh", root]);
        expect(worktreeHost(root, join(repository, ".git"))).toBe(`${name}.tablecast-poc`);
        expect(await readFile(join(root, ".devcontainer/.env"), "utf8")).toBe(
          `TABLECAST_WORKTREE_NAME=${name}\nTABLECAST_REPO_NAME=tablecast-poc\nTABLECAST_CONTAINER_ORIGIN=http://${name}.tablecast-poc.container.localhost:3000\n`,
        );
      }
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
  it("worktreeとrepoを別のDNSラベルにして不正な名前を拒否する", () => {
    expect(worktreeHost("/workspace/tablecast-poc")).toBe("main.tablecast-poc");
    expect(worktreeHost("/workspace/Voice_UI", "/workspace/tablecast-poc/.git")).toBe(
      "voice-ui.tablecast-poc",
    );
    expect(worktreeHost("/workspace/Voice_UI", "/workspace/tablecast-other/.git")).toBe(
      "voice-ui.tablecast-other",
    );
    expect(() => worktreeHost("/workspace/日本語")).toThrow("worktree名");
    expect(() => worktreeHost(`/workspace/${"a".repeat(64)}`)).toThrow("worktree名");
  });
  it("同じブランチでもworktree実パスが違う場合は識別子が分かれる", () => {
    expect(worktreeId("/tmp/tablecast-one", "/tmp/tablecast/.git")).not.toBe(
      worktreeId("/tmp/tablecast-two", "/tmp/tablecast/.git"),
    );
    expect(worktreeId("/tmp/tablecast-one", "/tmp/tablecast/.git")).toBe(
      worktreeId("/tmp/tablecast-one", "/tmp/tablecast/.git"),
    );
  });
  it("本番origin・別保存先・重複ポートへのreset要求を拒否する", () => {
    const runtime = {
      id: "0123456789",
      root: "/tmp/tablecast",
      origin: "http://main.tablecast.localhost:3000",
      ports: {
        proxy: 3000,
        web: 3001,
        inspector: 3002,
        signaling: 3003,
        rtcTcp: 3004,
        rtcUdp: 3005,
        agent: 3006,
        storybook: 3007,
      },
      state: "/tmp/tablecast/.local/state",
      apiConfig: "/tmp/tablecast/.local/api.wrangler.json",
      webConfig: "/tmp/tablecast/.local/web.wrangler.json",
    };
    expect(() =>
      assertLocalRuntime(
        { ...runtime, origin: "http://main.tablecast.localhost:3000" },
        runtime.root,
      ),
    ).not.toThrow();
    expect(() =>
      assertLocalRuntime(
        { ...runtime, origin: "http://tablecast-other.localhost:3000" },
        runtime.root,
      ),
    ).toThrow("別worktree・非ローカル・不整合の設定を操作できません。");
    expect(() => assertLocalRuntime(runtime, runtime.root)).not.toThrow(
      "別worktree・非ローカル・不整合の設定を操作できません。",
    );
    expect(() =>
      assertLocalRuntime({ ...runtime, origin: "https://tablecast.example.com" }, runtime.root),
    ).toThrow("別worktree・非ローカル・不整合の設定を操作できません。");
    expect(() =>
      assertLocalRuntime({ ...runtime, state: "/tmp/tablecast-other/.local/state" }, runtime.root),
    ).toThrow("別worktree・非ローカル・不整合の設定を操作できません。");
    expect(() =>
      assertLocalRuntime(
        { ...runtime, ports: { ...runtime.ports, signaling: 3001 } },
        runtime.root,
      ),
    ).toThrow("別worktree・非ローカル・不整合の設定を操作できません。");
  });
});
