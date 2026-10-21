import { openscreenPath } from "./tablecast-openscreen.ts";
import { execFile } from "node:child_process";
import process from "node:process";
import { parseArgs, promisify } from "node:util";
import { z } from "zod";
import { chromium } from "@playwright/test";
import { tablecastCaptureOrigin, tablecastHostArguments } from "./tablecast-app-capture.ts";

const run = promisify(execFile);

export async function checkCaptureHealth(origin = tablecastCaptureOrigin()) {
  // 撮影と同じChrome・名前解決規則で、指定worktreeへ接続する。
  const browser = await chromium.launch({
    channel: "chrome",
    args: tablecastHostArguments(origin),
  });
  try {
    const page = await browser.newPage();
    const health = new URL("/api/health", origin).href;
    const response = await page.goto(health, { timeout: 8_000, waitUntil: "domcontentloaded" });
    if (!response?.ok() || response.request().redirectedFrom() || page.url() !== health)
      throw new Error(`アプリのヘルスチェック: HTTP ${response?.status() ?? "応答なし"}`);
    return response.status();
  } finally {
    await browser.close();
  }
}

// OpenScreen --json は単一のJSONではなく、進捗と完了を別行に出す。
export function openScreenResult(stdout: string): unknown {
  const events = stdout
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("{"))
    .map((line): unknown => JSON.parse(line));
  const completed = events.findLast(
    (event) =>
      typeof event === "object" && event !== null && "event" in event && event.event === "done",
  );
  if (
    !completed ||
    typeof completed !== "object" ||
    !("success" in completed) ||
    completed.success !== true
  )
    throw new Error("OpenScreenの正常完了イベントを確認できません");
  return completed;
}

async function main() {
  const { values } = parseArgs({
    options: {
      openscreen: { type: "string" },
      window: { type: "string" },
      origin: { type: "string" },
    },
  });
  const openscreen = openscreenPath(values.openscreen);
  const options = { windowsHide: true, timeout: 30_000, encoding: "utf8" as const };
  for (const command of ["node", "ffmpeg", "ffprobe"])
    await run(command, [command === "node" ? "--version" : "-version"], options);
  console.info("OK: Node.js / FFmpeg / FFprobe");

  const { stdout: help } = await run(openscreen, ["help"], options);
  if (!["record", "export", "pack", "--auto-zoom"].every((name) => help.includes(name)))
    throw new Error("OpenScreen CLIの収録・編集・可搬化機能が不足しています");
  const { stdout } = await run(openscreen, ["sources", "--json"], options);
  const { sources } = z
    .object({
      sources: z.object({ windows: z.array(z.object({ id: z.string(), name: z.string() })) }),
    })
    .parse(openScreenResult(stdout));
  console.info("OK: OpenScreen CLI / 録画対象の列挙");
  if (values.window) {
    const matches = sources.windows.filter((window) => window.name.includes(values.window ?? ""));
    if (matches.length !== 1)
      throw new Error(`録画対象は一つ必要です: ${values.window} / ${matches.length}件`);
    console.info(`OK: 録画対象 ${matches[0]?.name}`);
  }

  const origin = tablecastCaptureOrigin(values.origin);
  const status = await checkCaptureHealth(origin);
  console.info(`OK: 実アプリ ${origin} HTTP ${status}`);
  console.info("ブラウザーの実操作・音声通話・録画の成功は、別途短い収録で確認してください。");
}

if (import.meta.main)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "環境検査に失敗しました");
    process.exitCode = 1;
  });
