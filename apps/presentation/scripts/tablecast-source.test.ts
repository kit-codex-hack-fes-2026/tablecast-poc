import { afterEach, expect, test } from "vitest";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveSource, sourcePathSchema, repositoryPath } from "./tablecast-source.ts";
import { readProject } from "./tablecast-project.ts";

const temporary: string[] = [];
test("既定台本の実装根拠がLFSなしでリポジトリ内に解決できる", async () => {
  const project = await readProject();
  const sources = new Set(
    project.scenes.flatMap((scene) => [
      ...(scene.technical?.sources ?? []),
      ...(scene.sourceTree?.map((entry) => entry.path) ?? []),
    ]),
  );
  expect(sources.size).toBeGreaterThan(0);
  for (const source of sources) await expect(resolveSource(source)).resolves.toBeTypeOf("string");
});

test("共有レポートの入力名をリポジトリ相対へ変え、外部の入力は拒否する", () => {
  const base = join(tmpdir(), "tablecast-report", "repo");
  expect(repositoryPath(join(base, "apps", "presentation", "project.json"), base)).toBe(
    "apps/presentation/project.json",
  );
  expect(() => repositoryPath(join(base, "..", "personal", "project.json"), base)).toThrow(
    "リポジトリ内",
  );
});
afterEach(async () => {
  for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true });
});

test.each([
  "../private/file",
  "a/../../file",
  "/tmp/file",
  "C:/private/file",
  "C:\\private\\file",
  "a/../file",
  ".",
  "a//file",
  "//server/file",
])("参照元の境界を逸脱する入力%sを拒否する", (path) => {
  expect(sourcePathSchema.safeParse(path).success).toBe(false);
});

test("実在する内部ファイルは読み込み、ディレクトリ内から外部へ向くリンクは拒否する", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tablecast-source-"));
  temporary.push(directory);
  const base = join(directory, "repo");
  await mkdir(join(base, "docs"), { recursive: true });
  await mkdir(join(directory, "private"));
  await writeFile(join(base, "docs", "source.md"), "根拠");
  await writeFile(join(directory, "private", "outside.md"), "合成の境界外ファイル");
  expect(await resolveSource("docs/source.md", base)).toBe(join(base, "docs", "source.md"));
  await expect(resolveSource("docs/missing.md", base)).rejects.toThrow(/ENOENT/);
  await symlink(
    join(directory, "private"),
    join(base, "docs", "linked"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await expect(resolveSource("docs/linked/outside.md", base)).rejects.toThrow("リポジトリの外");
  await expect(resolveSource("docs", base)).rejects.toThrow("リポジトリの外");
});
