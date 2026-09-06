import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { bootstrapOptions, bootstrapTarget, readBootstrapInput } from "./tablecast-bootstrap";
import { demoStores } from "./tablecast-fixtures";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execute = promisify(execFile);
const config = {
  name: "tablecast-bootstrap-test",
  account_id: "0123456789abcdef0123456789abcdef",
  compatibility_date: "2026-09-03",
  compatibility_flags: ["nodejs_compat"],
  env: {
    staging: {
      name: "tablecast-api-bootstrap-test",
      vars: {
        TABLECAST_ENV: "staging",
        TABLECAST_PUBLIC_ORIGIN: "https://tablecast.example.invalid",
      },
      d1_databases: [
        {
          binding: "TABLECAST_DB",
          database_name: "tablecast-bootstrap-test",
          database_id: "11111111-1111-4111-8111-111111111111",
          migrations_dir: join(root, "apps/api/migrations"),
        },
      ],
    },
  },
};
function input() {
  const [store] = demoStores("smoke");
  if (!store) throw new Error("検証カタログがありません。");
  return {
    authSecret: "tablecast-bootstrap-test-private-auth-secret",
    admin: {
      name: "初期管理者",
      email: "bootstrap@tablecast.example.invalid",
      password: "tablecast-bootstrap-private-password",
      locale: "ja",
    },
    organization: { name: "初期組織", slug: "tablecast-bootstrap-test" },
    store: {
      id: "tablecast-bootstrap-store",
      name: "初期店舗",
      configuration: store.configuration,
    },
    tables: [{ id: "tablecast-bootstrap-table-01", name: "T01" }],
  };
}

describe("初期セットアップCLIの対象固定", () => {
  it("明示環境だけを使い未指定環境や別originを拒否する", () => {
    expect(bootstrapTarget(JSON.stringify(config), "staging").database.database_id).toBe(
      config.env.staging.d1_databases[0]?.database_id,
    );
    expect(() => bootstrapTarget(JSON.stringify(config), "production")).toThrow(ZodError);
    for (const origin of [
      "http://tablecast.example.invalid",
      "https://tablecast.example.invalid/path",
      "https://user:password@tablecast.example.invalid",
    ]) {
      const invalid = structuredClone(config);
      invalid.env.staging.vars.TABLECAST_PUBLIC_ORIGIN = origin;
      expect(() => bootstrapTarget(JSON.stringify(invalid), "staging")).toThrow(ZodError);
    }
    const wrongEnvironment = structuredClone(config);
    wrongEnvironment.env.staging.vars.TABLECAST_ENV = "production";
    expect(() => bootstrapTarget(JSON.stringify(wrongEnvironment), "staging")).toThrow(
      "指定環境とTABLECAST_ENVが一致しません。",
    );
  });
  it("localとremoteの曖昧な指定や保存先の混用を拒否する", () => {
    const args = [
      "--config",
      "tablecast.json",
      "--env",
      "staging",
      "--input",
      "tablecast-private.json",
    ];
    for (const flags of [
      [],
      ["--local"],
      ["--local", "--remote"],
      ["--remote", "--persist-to", "tablecast-state"],
    ]) {
      expect(() => bootstrapOptions([...args, ...flags])).toThrow(/指定/);
    }
    expect(bootstrapOptions([...args, "--remote"]).apply).toBe(false);
    expect(bootstrapOptions([...args, "--local", "--persist-to", "tablecast-state"]).remote).toBe(
      false,
    );
  });
  it("秘密入力の公開読取り権限とsymlinkを拒否する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tablecast-bootstrap-input-"));
    const path = join(directory, "private.json");
    try {
      await writeFile(path, JSON.stringify(input()), { mode: 0o600 });
      expect((await readBootstrapInput(path)).admin.locale).toBe("ja");
      await chmod(path, 0o644);
      await expect(readBootstrapInput(path)).rejects.toThrow(
        "入力は所有者だけが読める1MiB以下の通常ファイルにしてください。",
      );
      await chmod(path, 0o600);
      const link = join(directory, "link.json");
      await symlink(path, link);
      await expect(readBootstrapInput(link)).rejects.toMatchObject({ code: "ELOOP" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("実CLIの事前確認はDBを作らず適用は移行済み専用D1だけを初期化する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tablecast-bootstrap-cli-"));
    const configPath = join(directory, "wrangler.json");
    const inputPath = join(directory, "private.json");
    const state = join(directory, "tablecast-state");
    const args = [
      "--no-env-file",
      "scripts/tablecast-bootstrap.ts",
      "--config",
      configPath,
      "--env",
      "staging",
      "--input",
      inputPath,
      "--local",
      "--persist-to",
      state,
    ];
    const run = (...tail: string[]) =>
      execute("bun", [...args, ...tail], { cwd: root, timeout: 45000 });
    const wrangler = (...tail: string[]) =>
      execute(
        "bun",
        [
          "--no-env-file",
          "x",
          "--no-install",
          "wrangler",
          ...tail,
          "--config",
          configPath,
          "--env",
          "staging",
          "--local",
          "--persist-to",
          state,
        ],
        { cwd: root, timeout: 45000 },
      );
    try {
      await writeFile(configPath, JSON.stringify(config));
      await writeFile(inputPath, JSON.stringify(input()), { mode: 0o600 });
      // 周辺の開発用dotenvを読み込まないことも実CLIで確認する。
      await writeFile(
        join(directory, ".dev.vars"),
        "TABLECAST_PUBLIC_ORIGIN=http://unexpected.invalid\n",
      );
      const preview = await run();
      expect(preview.stdout).toContain('"apply": false');
      expect(preview.stdout + preview.stderr).not.toContain(input().admin.password);
      expect(preview.stdout + preview.stderr).not.toContain(input().authSecret);
      await expect(stat(state)).rejects.toMatchObject({ code: "ENOENT" });
      await wrangler("d1", "migrations", "apply", "TABLECAST_DB");
      const applied = await run("--apply");
      expect(applied.stdout).toContain('"configVersion": 1');
      expect(applied.stdout + applied.stderr).not.toContain(input().admin.password);
      expect(applied.stdout + applied.stderr).not.toContain(input().authSecret);
      await expect(run("--apply")).rejects.toMatchObject({ code: 1 });
      const result = await wrangler(
        "d1",
        "execute",
        "TABLECAST_DB",
        "--json",
        "--command",
        "SELECT (SELECT COUNT(*) FROM user) AS users,(SELECT COUNT(*) FROM stores) AS stores,(SELECT COUNT(*) FROM config_releases) AS releases,(SELECT COUNT(*) FROM restaurant_tables) AS tables",
      );
      const rows: unknown = JSON.parse(result.stdout);
      expect(rows).toMatchObject([{ results: [{ users: 1, stores: 1, releases: 1, tables: 1 }] }]);
      expect(await readFile(inputPath, "utf8")).toBe(JSON.stringify(input()));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 90000);
});
