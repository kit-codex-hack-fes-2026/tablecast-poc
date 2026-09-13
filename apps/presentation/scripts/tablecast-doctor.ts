import { execFile } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";
import { parseArgs, promisify } from "node:util";
import { z } from "zod";

const run = promisify(execFile);

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
      origin: { type: "string", default: "http://127.0.0.1:3000" },
    },
  });
  const openscreen =
    values.openscreen ??
    (process.platform === "win32" && process.env.LOCALAPPDATA
      ? resolve(process.env.LOCALAPPDATA, "Programs/Openscreen/Openscreen.exe")
      : "openscreen");
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

  const origin = new URL(values.origin);
  if (origin.protocol !== "http:" && origin.protocol !== "https:")
    throw new Error("アプリの接続先はHTTPまたはHTTPSで指定してください");
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/")
    throw new Error("アプリの接続先にはoriginだけを指定してください");
  const response = await fetch(new URL("/api/health", origin), {
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`アプリのヘルスチェック: HTTP ${response.status}`);
  console.info(`OK: 実アプリ HTTP ${response.status}`);
  console.info("ブラウザーの実操作・音声通話・録画の成功は、別途短い収録で確認してください。");
}

if (import.meta.main)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "環境検査に失敗しました");
    process.exitCode = 1;
  });
