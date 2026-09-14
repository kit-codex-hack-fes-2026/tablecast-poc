import { execFile } from "node:child_process";
import { copyFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import type { z } from "zod";
import type { pointerEvent } from "./tablecast-capture-types.ts";
import { openscreenPath } from "./tablecast-openscreen.ts";

type Event = z.infer<typeof pointerEvent>;
// 画像の中心ではなく矢印の先端・指先を実際の操作座標へ置く。
export const cursorArt = {
  arrow: { width: 42, height: 70, tipX: 0.119, tipY: 0.0874 },
  pointer: { width: 58, height: 73, tipX: 0.3893, tipY: 0.0032 },
};
export async function copyCursorAssets(out: string) {
  const resources = process.env.TABLECAST_OPENSCREEN_CURSORS?.trim()
    ? resolve(process.env.TABLECAST_OPENSCREEN_CURSORS)
    : resolve(dirname(openscreenPath()), "resources/cursors/default");
  for (const type of Object.keys(cursorArt))
    await copyFile(resolve(resources, `${type}.png`), resolve(out, `tablecast-cursor-${type}.png`));
}
export function cursorAt(events: Event[], at: number) {
  if (
    !events.some(
      (event) => event.interactionType === "click" && at >= event.at - 600 && at <= event.at + 350,
    )
  )
    return null;
  const previous = events.findLast((event) => event.at <= at);
  const next = events.find((event) => event.at > at);
  const lastClick = events.findLast((event) => event.interactionType === "click" && event.at <= at);
  if (!previous || (at - previous.at > 150 && (!lastClick || at - lastClick.at > 350))) return null;
  const fraction =
    next && next.at - previous.at <= 200 ? (at - previous.at) / (next.at - previous.at) : 0;
  return {
    x: previous.x + ((next?.x ?? previous.x) - previous.x) * fraction,
    y: previous.y + ((next?.y ?? previous.y) - previous.y) * fraction,
    type: previous.cursorType === "pointer" ? ("pointer" as const) : ("arrow" as const),
  };
}

// 現行CLIはカーソルのsize/visible設定を落とすため、標準FFmpegで実操作区間だけを
// 等倍素材へ合成する。その後の移動・拡大は画面と一緒にOpenScreenが一度だけ行う。
export async function composeCursor(
  source: string,
  events: Event[],
  sourceStart: number,
  viewport: { width: number; height: number },
  frame: { x: number; y: number; width: number; height: number },
) {
  const out = dirname(source);
  const run = promisify(execFile);
  const duration = Number(
    (
      await run(
        "ffprobe",
        ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", source],
        { windowsHide: true },
      )
    ).stdout,
  );
  if (!Number.isFinite(duration) || !Number.isFinite(sourceStart))
    throw new Error("カーソルの録画時刻がありません");
  const sorted = [...events].sort((a, b) => a.at - b.at);
  const height = Math.round((26 * frame.height) / viewport.height);
  const commands: string[] = [];
  let previous = "";
  for (let i = 0; i < Math.ceil(duration * 30); i++) {
    const cursor = cursorAt(sorted, sourceStart + (i * 1000) / 30);
    const positions = Object.entries(cursorArt).map(([type, art]) => {
      const shown =
        cursor?.type === type &&
        cursor.x >= 0 &&
        cursor.x < viewport.width &&
        cursor.y >= 0 &&
        cursor.y < viewport.height;
      const width = Math.round((height * art.width) / art.height);
      return {
        type,
        x: shown
          ? Math.round(frame.x + (cursor.x * frame.width) / viewport.width - art.tipX * width)
          : -1000,
        y: shown
          ? Math.round(frame.y + (cursor.y * frame.height) / viewport.height - art.tipY * height)
          : -1000,
      };
    });
    const signature = JSON.stringify(positions);
    if (signature !== previous)
      commands.push(
        `${(i / 30).toFixed(6)} ${positions.flatMap((p) => [`overlay@${p.type} x ${p.x}`, `overlay@${p.type} y ${p.y}`]).join(", ")};`,
      );
    previous = signature;
  }
  await writeFile(resolve(out, "tablecast-cursor.commands"), commands.join("\n"));
  await copyCursorAssets(out);
  const filter = `[0:v]fps=30,sendcmd=f=tablecast-cursor.commands[base];[1:v]scale=-1:${height}[arrow];[2:v]scale=-1:${height}[hand];[base][arrow]overlay@arrow=x=-1000:y=-1000:eval=frame[mid];[mid][hand]overlay@pointer=x=-1000:y=-1000:eval=frame[v]`;
  const target = resolve(out, "tablecast-source-cursor.mp4");
  await run(
    "ffmpeg",
    [
      "-v",
      "error",
      "-y",
      "-i",
      source,
      "-i",
      "tablecast-cursor-arrow.png",
      "-i",
      "tablecast-cursor-pointer.png",
      "-filter_complex",
      filter,
      "-map",
      "[v]",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-crf",
      "17",
      "-preset",
      "fast",
      "-g",
      "30",
      "-keyint_min",
      "30",
      "-sc_threshold",
      "0",
      "-c:a",
      "copy",
      "-t",
      String(duration),
      target,
    ],
    { cwd: out, windowsHide: true, timeout: 300000, maxBuffer: 2000000 },
  );
  await writeFile(
    `${target}.cursor.json`,
    JSON.stringify(
      {
        version: 2,
        provider: "none",
        assets: [],
        samples: [],
        provenance:
          "Recorded clicks only; sprites composited into this video before OpenScreen zoom. Original telemetry is in tablecast-events.json.",
      },
      null,
      2,
    ),
  );
  return target;
}
