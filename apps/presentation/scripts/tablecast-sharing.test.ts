import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { posix, resolve, win32 } from "node:path";
import { expect, test } from "vitest";
import { screenProject } from "./tablecast-capture-types.ts";

const root = resolve(import.meta.dirname, "..");
// 未採用テイクや非公開原本は検査せず、CIと同じGit管理対象だけを読む。
const files = execFileSync(
  "git",
  [
    "ls-files",
    "-z",
    "--",
    "assets/openscreen/**/*.openscreen",
    "assets/openscreen/**/tablecast-record.log",
  ],
  { cwd: root, encoding: "utf8", windowsHide: true },
)
  .split("\0")
  .filter(Boolean);

test("共有OpenScreen projectをLFSなしで読み、メディアの絶対パスを拒否する", async () => {
  const projects = files.filter((file) => file.endsWith(".openscreen"));
  expect(projects.length).toBeGreaterThan(0);
  for (const file of projects) {
    const project = screenProject.parse(JSON.parse(await readFile(resolve(root, file), "utf8")));
    for (const [key, value] of Object.entries(project.media)) {
      if (!key.endsWith("Path")) continue;
      expect(typeof value, `${file}: ${key}`).toBe("string");
      if (typeof value !== "string") continue;
      expect(
        win32.isAbsolute(value) || posix.isAbsolute(value) || /^file:/i.test(value),
        `${file}: ${key}を相対参照にする`,
      ).toBe(false);
    }
  }
});

test("共有projectと収録ログへ個人の保存先を再混入させない", async () => {
  expect(files.some((file) => file.endsWith(".log"))).toBe(true);
  for (const file of files) {
    const text = (await readFile(resolve(root, file), "utf8")).replaceAll("\\\\", "\\");
    // /wallpapers/... はOpenScreen同梱アセットの識別子なので対象外。
    const localPath =
      /(?:^|[^a-z0-9+.-])[a-z]:[\\/]|file:\/{2,}|\/(?:Users|home|root|mnt|media|tmp|var|private|opt|usr)\//im;
    expect(localPath.test(text), `${file}: ローカル保存先を共有用の参照・記号へ置換する`).toBe(
      false,
    );
  }
});
