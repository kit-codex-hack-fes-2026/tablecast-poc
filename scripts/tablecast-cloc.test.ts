import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  aggregateCloc,
  classifyClocFile,
  clocCategories,
  clocCommentMarker,
  measureCloc,
  renderClocComment,
} from "./tablecast-cloc.ts";

const externalSkills = new Set(["downloaded-skill"]);
const exec = promisify(execFile);
const directories: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("種類別のcloc行数", () => {
  test.each([
    ["AGENTS.md", "documentation"],
    ["docs/setup.md", "documentation"],
    [".agents/skills/tablecast-web/SKILL.md", "documentation"],
    ["plugins/tablecast/skills/tablecast-help/references/ja/guide.md", "documentation"],
    ["apps/web/src/components/button.tsx", "implementation"],
    ["apps/web/src/env.d.ts", "implementation"],
    ["apps/web/src/styles.css", "implementation"],
    ["apps/emulate/index.ts", "implementation"],
    ["scripts/tablecast-seed.ts", "implementation"],
    ["scripts/tablecast-fixtures/items.ts", "implementation"],
    ["scripts/tablecast-fixtures.ts", "implementation"],
    ["apps/api/test/orders.test.ts", "unit"],
    ["scripts/tablecast-cloc.test.ts", "unit"],
    ["apps/web/src/features/kiosk/kiosk.browser.test.tsx", "browser"],
    ["apps/web/src/components/button.stories.tsx", "storybook"],
    ["apps/web/src/components/design-system.mdx", "storybook"],
    ["apps/web/.storybook/tablecast-seed-config.ts", "storybook"],
    ["apps/web/e2e/orders.spec.ts", "e2e"],
    ["apps/web/e2e/support/global-setup.ts", "support"],
    ["apps/api/test/setup.ts", "support"],
    ["apps/api/test/auth-fixture.ts", "support"],
    ["apps/web/src/test-support/fixture.ts", "support"],
    [".github/workflows/ci.yml", "configuration"],
    [".devcontainer/Dockerfile", "configuration"],
    ["apps/web/vitest.config.ts", "configuration"],
    [".fallowrc.json", "configuration"],
    ["package.json", "configuration"],
    ["apps/api/migrations/0000_initial.sql", "migration"],
    ["apps/web/messages/en.json", "other"],
    ["apps/presentation/AGENTS.md", null],
    [".agents/skills/downloaded-skill/SKILL.md", null],
    ["apps/web/src/routeTree.gen.ts", null],
    ["apps/web/src/paraglide/messages.js", null],
    ["apps/api/src/cloudflare-env.d.ts", null],
    ["apps/api/migrations/meta/0000_snapshot.json", null],
    ["assets/demo/generated-menu.json", null],
    ["apps/web/dist/assets/main.js", null],
    ["bun.lock", null],
    ["skills-lock.json", null],
    ["assets/demo/menu.webp", null],
  ])("%sを対応する種類だけへ分類する", (path, expected) => {
    expect(classifyClocFile(path, externalSkills)).toBe(expected);
  });

  test("空分類は0行にでき、不正な版・行数は計測失敗にする", () => {
    expect(aggregateCloc({ header: { cloc_version: "2.10" } }, externalSkills)).toEqual({});
    expect(
      aggregateCloc(
        {
          header: { cloc_version: "2.10" },
          "./apps/web/src/button.tsx": { code: 7 },
          "apps/web/src/button.stories.tsx": { code: 3 },
          "apps/presentation/main.ts": { code: 999 },
          SUM: { code: 1009 },
        },
        externalSkills,
      ),
    ).toEqual({ implementation: 7, storybook: 3 });
    for (const data of [
      null,
      {},
      { header: { cloc_version: "2.11" } },
      {
        header: { cloc_version: "2.10" },
        "file.ts": { code: -1 },
      },
      { header: { cloc_version: "2.10" }, "file.ts": { code: "1" } },
    ])
      expect(() => aggregateCloc(data, externalSkills)).toThrow(/cloc/);
  });

  test("全分類・合計・符号・commitリンクと計測完了のJST日時を表示する", () => {
    const body = renderClocComment(
      {
        base: "a".repeat(40),
        head: "b".repeat(40),
        before: { implementation: 1001, unit: 10 },
        after: { implementation: 999, unit: 13 },
        measuredAt: "2026-10-29T00:12:34.000Z",
      },
      "example/tablecast",
      "https://github.com/example/tablecast/actions/runs/1",
    );
    expect(body.startsWith(`${clocCommentMarker}\n`)).toBe(true);
    expect(body).toContain("2026-10-29 09:12:34");
    expect(body).toContain("[CI ↗](https://github.com/example/tablecast/actions/runs/1)");
    expect(body).toContain(`/commit/${"a".repeat(40)}`);
    expect(body).toContain(`/commit/${"b".repeat(40)}`);
    for (const { label } of clocCategories) expect(body).toContain(`| ${label} |`);
    expect(body).toContain("| 実装コード | 1,001 | 999 | -2 |");
    expect(body).toContain("| 単体・統合テスト | 10 | 13 | +3 |");
    expect(body).toContain("| Storybook | 0 | 0 | 0 |");
    expect(body).toContain("| **合計** | **1,011** | **1,012** | **+1** |");
  });
});

async function repository() {
  const directory = await mkdtemp(join(tmpdir(), "tablecast-cloc-"));
  directories.push(directory);
  const git = async (...args: string[]) =>
    (await exec("git", args, { cwd: directory })).stdout.trim();
  const file = async (path: string, content: string) => {
    const target = join(directory, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  };
  const commit = async (message: string) => {
    await git("add", ".");
    await git("commit", "--quiet", "-m", message);
    return git("rev-parse", "HEAD");
  };
  await git("init", "--quiet");
  await git("config", "user.name", "TableCast Test");
  await git("config", "user.email", "tablecast@example.test");
  await git("config", "commit.gpgsign", "false");
  await git("config", "core.hooksPath", "/dev/null");
  return { commit, directory, file, git };
}

describe("実clocとGit snapshotの比較", () => {
  test("分岐点からの追加・削除・分類間移動を数え、未追跡・重複・取得skillの境界を保つ", async () => {
    const { commit, directory, file, git } = await repository();
    await file("README.md", "# TableCast\n");
    await file("skills-lock.json", JSON.stringify({ skills: { "old-skill": {} } }));
    await file(".agents/skills/old-skill/SKILL.md", "old\n");
    await file(".agents/skills/new-skill/SKILL.md", "new\n");
    await file(
      "apps/web/src/app.ts",
      "// コメント\nexport const first = 1;\n\nexport const second = 2;\n",
    );
    await file("apps/api/src/remove.ts", "export const removed = true;\n");
    await file("apps/web/src/move.ts", "export const story = true;\n");
    for (const name of ["one", "two"])
      await file(`apps/web/src/${name}.ts`, "export const duplicate = true;\n");
    await file("scripts/tablecast-fixtures/menu.ts", "export const seed = [];\n");
    await file("apps/api/test/orders.test.ts", "export const test = true;\n");
    await file("apps/web/src/routeTree.gen.ts", "export const generated = true;\n");
    await file("apps/presentation/main.ts", "export const video = true;\n");
    const common = await commit("base");
    await file("apps/api/src/base-only.ts", "export const unrelated = true;\n");
    const base = await commit("base branch only");
    await git("checkout", "--detach", common);
    await file("skills-lock.json", JSON.stringify({ skills: { "new-skill": {} } }));
    await file(
      "apps/web/src/app.ts",
      "/* 別のコメント */\n\nexport const first = 1;\nexport const second = 2;\n\n",
    );
    await rm(join(directory, "apps/api/src/remove.ts"));
    await rename(
      join(directory, "apps/web/src/move.ts"),
      join(directory, "apps/web/src/move.stories.ts"),
    );
    await file("apps/api/src/added.ts", "export const added = true;\n");
    const head = await commit("PR changes");
    await file("apps/api/src/untracked.ts", "export const untracked = true;\n");
    const result = await measureCloc(base, head, directory);
    expect(result.base).toBe(common);
    expect(result.before).toEqual({ documentation: 1, implementation: 7, unit: 1 });
    expect(result.after).toEqual({ documentation: 1, implementation: 6, storybook: 1, unit: 1 });
    expect(Number.isFinite(Date.parse(result.measuredAt))).toBe(true);
    const reverse = await measureCloc(head, common, directory);
    expect(reverse.before).toEqual(reverse.after);
  }, 20000);

  test("不正SHA・存在しないcommit・cloc起動失敗を0行で補わない", async () => {
    const { commit, directory, file } = await repository();
    await file("README.md", "# TableCast\n");
    const sha = await commit("base");
    await expect(measureCloc("--help", sha, directory)).rejects.toThrow("40桁");
    await expect(measureCloc("f".repeat(40), sha, directory)).rejects.toThrow(/git merge-base/);
    vi.stubEnv("TABLECAST_CLOC_PATH", join(directory, "missing-cloc"));
    await expect(measureCloc(sha, sha, directory)).rejects.toThrow(/missing-cloc/);
  });
});
