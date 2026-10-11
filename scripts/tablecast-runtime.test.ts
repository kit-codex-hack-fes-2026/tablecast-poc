import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { join } from "node:path";
import { parseEnv, promisify } from "node:util";
import { z } from "zod";
import { localReleaseSha, worktreeId } from "./tablecast-runtime";

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
    const codex = join(parent, "073d", "Tablecast_PoC");
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
      await git("worktree", "add", "--detach", codex);
      const projects = new Set<string>();
      for (const [root, name] of [
        [repository, "main"],
        [linked, "voice-ui"],
        [codex, "073d"],
      ] as const) {
        await mkdir(join(root, ".devcontainer"));
        await execute("sh", [".devcontainer/tablecast-init.sh", root]);
        const settings = parseEnv(await readFile(join(root, ".devcontainer/.env"), "utf8"));
        expect(settings.TABLECAST_WORKTREE_NAME).toBe(name);
        expect(settings.TABLECAST_REPO_NAME).toBe("tablecast-poc");
        expect(settings.TABLECAST_WORKSPACE_FOLDER).toBe(await realpath(root));
        expect(settings.TABLECAST_GIT_COMMON_DIR).toBe(await realpath(join(repository, ".git")));
        expect(settings.TABLECAST_CONTAINER_ORIGIN).toBe(
          `http://${name}.tablecast-poc.container.localhost:${settings.TABLECAST_WEB_PORT}`,
        );
        expect(settings.COMPOSE_PROJECT_NAME).toMatch(/^tablecast-\d+$/);
        projects.add(settings.COMPOSE_PROJECT_NAME ?? "");
        // 再生成しても同じ資源を使い続ける。
        await execute("sh", [".devcontainer/tablecast-init.sh", root]);
        expect(parseEnv(await readFile(join(root, ".devcontainer/.env"), "utf8"))).toEqual(
          settings,
        );
      }
      expect(projects.size).toBe(3);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  }, 15_000);
  it("同じブランチでもworktree実パスが違う場合は識別子が分かれる", () => {
    expect(worktreeId("/tmp/tablecast-one", "/tmp/tablecast/.git")).not.toBe(
      worktreeId("/tmp/tablecast-two", "/tmp/tablecast/.git"),
    );
    expect(worktreeId("/tmp/tablecast-one", "/tmp/tablecast/.git")).toBe(
      worktreeId("/tmp/tablecast-one", "/tmp/tablecast/.git"),
    );
  });
  it("保存した他worktreeのパスを採用せず、secretを保持し稼働中の初期化を拒否する", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "tablecast-runtime-")));
    const execute = promisify(execFile);
    const server = createServer();
    const env = {
      PATH: process.env.PATH,
      HOME: root,
      PORTLESS_STATE_DIR: join(root, ".portless"),
      PORTLESS_PORT: "80",
      PORTLESS_HTTPS: "0",
    };
    try {
      await execute("git", ["init", "--quiet"], { cwd: root });
      await execute(
        "git",
        [
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
        ],
        { cwd: root },
      );
      for (const path of ["scripts", "apps/api", "apps/web", ".local/state"])
        await mkdir(join(root, path), { recursive: true });
      await symlink(join(process.cwd(), "node_modules"), join(root, "node_modules"), "dir");
      for (const path of [
        "scripts/tablecast-runtime.ts",
        "scripts/tablecast-local-state.ts",
        "scripts/tablecast-deploy-config.ts",
        "apps/api/cloudflare.config.ts",
      ])
        await cp(join(process.cwd(), path), join(root, path));
      await writeFile(join(root, ".local/state/tablecast-keep"), "tablecast saved data");
      await writeFile(
        join(root, ".local/.dev.vars"),
        "TABLECAST_AUTH_SECRET=tablecast-owned-auth\n",
      );
      await writeFile(
        join(root, ".local/runtime.json"),
        JSON.stringify({
          root: "/tmp/tablecast-other",
          state: "/tmp/tablecast-other/.local/state",
          origin: "https://tablecast.example.com",
          ports: { web: 0 },
        }),
      );
      await execute("bun", ["--no-env-file", "scripts/tablecast-runtime.ts"], { cwd: root, env });
      const apiValue: unknown = JSON.parse(
        await readFile(join(root, ".local/api.wrangler.json"), "utf8"),
      );
      const api = z
        .object({ main: z.string(), vars: z.object({ TABLECAST_PUBLIC_ORIGIN: z.string() }) })
        .parse(apiValue);
      expect(api.main).toBe(join(root, "apps/api/src/worker.ts"));
      expect(api.vars.TABLECAST_PUBLIC_ORIGIN).toMatch(
        /^http:\/\/web\.[a-f0-9]{10}\.tablecast-poc\.localhost$/,
      );
      expect(parseEnv(await readFile(join(root, ".local/.env"), "utf8")).TABLECAST_STATE_PATH).toBe(
        join(root, ".local/state"),
      );
      expect(
        parseEnv(await readFile(join(root, ".local/.dev.vars"), "utf8")).TABLECAST_AUTH_SECRET,
      ).toBe("tablecast-owned-auth");
      expect(await readFile(join(root, ".local/state/tablecast-keep"), "utf8")).toBe(
        "tablecast saved data",
      );
      await expect(
        execute("bun", ["--no-env-file", "scripts/tablecast-runtime.ts"], {
          cwd: root,
          env: {
            ...env,
            TABLECAST_CONTAINER: "1",
            TABLECAST_CONTAINER_ORIGIN: "https://tablecast.example.com",
          },
        }),
      ).rejects.toThrow("非ローカルの開発originは使用できません。");
      await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("待受がありません。");
      await writeFile(
        join(root, ".local/runtime.json"),
        JSON.stringify({ ports: { web: address.port } }),
      );
      await expect(
        execute("bun", ["--no-env-file", "scripts/tablecast-runtime.ts"], { cwd: root, env }),
      ).rejects.toThrow("開発プロセスをCtrl+Cで停止してから初期化してください。");
      expect(await readFile(join(root, ".local/state/tablecast-keep"), "utf8")).toBe(
        "tablecast saved data",
      );
    } finally {
      server.close();
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);
});

it("Bunの開発envからAPI設定に採用する項目だけを選ぶ", async () => {
  const root = await mkdtemp(join(tmpdir(), "tablecast-bun-env-"));
  const execute = promisify(execFile);
  try {
    // Given: 標準のenvファイルと、共有を許可しない資格を用意する。
    await writeFile(join(root, ".env"), "TABLECAST_MODEL=tablecast-base\n");
    await writeFile(join(root, ".env.development"), "TABLECAST_MODEL=tablecast-development\n");
    await writeFile(
      join(root, ".env.local"),
      'TABLECAST_MODEL=tablecast-local\nTABLECAST_MODEL_API_KEY="${TABLECAST_MODEL}-key"\nCLOUDFLARE_API_TOKEN=tablecast-production-key\nTABLECAST_AUTH_SECRET=tablecast-shared-auth\n',
    );
    const module = join(process.cwd(), "scripts/tablecast-runtime.ts");
    // When: 実際のBunでenvを読み込み、本番と同じ受け渡し関数を使う。
    const { stdout } = await execute(
      "bun",
      [
        "--eval",
        `import { developmentSecrets } from ${JSON.stringify(module)}; console.log(JSON.stringify(developmentSecrets()));`,
      ],
      {
        cwd: root,
        env: { PATH: process.env.PATH, HOME: root, NODE_ENV: "development" },
      },
    );
    // Then: 展開済みの開発資格だけを選び、Cloudflare資格と共有認証鍵を除く。
    expect(JSON.parse(stdout)).toEqual({
      TABLECAST_MODEL: "tablecast-local",
      TABLECAST_MODEL_API_KEY: "tablecast-local-key",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
