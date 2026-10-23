import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import process from "node:process";

const args = process.argv.slice(2);

function runVitest(commandArgs: string[] = ["run"], reportArgs: string[] = []) {
  const result = spawnSync(
    "bun",
    ["x", "--no-install", "vitest", ...commandArgs, ...args, ...reportArgs],
    {
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function run() {
  if (process.env.TABLECAST_TEST_MODE !== "changed") {
    console.info("差分実行の対象外のためVitestを全実行します。");
    return runVitest();
  }
  let files: unknown;
  try {
    files = JSON.parse(process.env.TABLECAST_TEST_FILES ?? "null");
  } catch {
    console.info("変更ファイルのJSONが不正なためVitestを全実行します。");
    return runVitest();
  }
  if (!Array.isArray(files) || !files.length) {
    console.info("変更ファイルが不明なためVitestを全実行します。");
    return runVitest();
  }
  const root = resolve(import.meta.dirname, "..");
  const sources: string[] = [];
  for (const file of files) {
    if (
      typeof file !== "string" ||
      !file ||
      isAbsolute(file) ||
      file.includes("\\") ||
      file.split("").some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
      }) ||
      file.split("/").some((part) => !part || part === "." || part === "..")
    ) {
      console.info("変更ファイルのパスが不正なためVitestを全実行します。");
      return runVitest();
    }
    const path = resolve(root, file);
    const fromRoot = relative(root, path);
    if (!fromRoot || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
      console.info("変更ファイルがリポジトリの外を指すためVitestを全実行します。");
      return runVitest();
    }
    sources.push(path);
  }

  const directory = mkdtempSync(join(tmpdir(), "tablecast-vitest-changed-"));
  const reportPath = join(directory, "report.json");
  try {
    console.info(`変更ファイル${sources.length}件に関連するVitestの差分テストを実行します。`);
    const code = runVitest(
      ["related", "--run", ...sources],
      [
        "--passWithNoTests",
        "--reporter=default",
        "--reporter=json",
        `--outputFile.json=${reportPath}`,
      ],
    );
    // 失敗は再実行せず、元の終了コードを返す。
    if (code !== 0) return code;
    const report: unknown = JSON.parse(readFileSync(reportPath, "utf8"));
    if (
      typeof report !== "object" ||
      report === null ||
      !("numTotalTests" in report) ||
      typeof report.numTotalTests !== "number" ||
      !Number.isSafeInteger(report.numTotalTests) ||
      report.numTotalTests < 0
    )
      throw new Error("差分実行のJSONに有効なテスト件数がありません。");
    if (report.numTotalTests === 0) {
      console.info("差分テストが0件のため、対象projectのVitestを全実行します。");
      return runVitest();
    }
    return 0;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

try {
  process.exitCode = run();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
