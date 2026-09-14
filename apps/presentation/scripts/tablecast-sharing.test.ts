import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { posix, resolve, win32 } from "node:path";
import { expect, test } from "vitest";
import { screenProject } from "./tablecast-capture-types.ts";

const root = resolve(import.meta.dirname, "..");
function hasLocalPath(raw: string) {
  // UNCの先頭はJSONのエスケープ解除前に調べ、ネットワークの保存先も拒否する。
  if (/(?:^|[\s"'=:])\\{2,}[^\\\s]+\\+[^\\\s]+/m.test(raw)) return true;
  if (/(?:^|[\s"'=])\/{2}[^/\s]+\/[^/\s]+/m.test(raw)) return true;
  const text = raw.replaceAll("\\\\", "\\");
  // /wallpapers/... はOpenScreen同梱アセットの識別子なので対象外。
  return /(?:^|[^a-z0-9+.-])[a-z]:[\\/]|file:\/{2,}|\/(?:Users|home|root|mnt|media|tmp|var|private|opt|usr)\//im.test(
    text,
  );
}

test.each([
  String.raw`保存先: \\server\share\person\take.mp4`,
  JSON.stringify({ path: String.raw`\\server\share\person\take.mp4` }),
  String.raw`保存先: \\?\UNC\server\share\take.mp4`,
  String.raw`保存先: C:\Users\person\take.mp4`,
  "保存先: /home/person/take.mp4",
  "保存先: //server/share/person/take.mp4",
])("絶対保存先を含むログを拒否する: %s", (text) => {
  expect(hasLocalPath(text)).toBe(true);
});
test.each([
  "保存先: [USERPROFILE]/tablecast/take.mp4",
  "参照: https://example.com/tablecast/assets",
  JSON.stringify({ path: String.raw`original\take.mp4`, wallpaper: "/wallpapers/grid.png" }),
])("共有用の相対参照は許可する: %s", (text) => {
  expect(hasLocalPath(text)).toBe(false);
});
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
    const text = await readFile(resolve(root, file), "utf8");
    expect(hasLocalPath(text), `${file}: ローカル保存先を共有用の参照・記号へ置換する`).toBe(false);
  }
});
