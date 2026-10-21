import type { z } from "zod";
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import type { screenProject } from "../tablecast-capture-types.ts";
import { assertCaptureFrame, videoDimensions } from "../tablecast-capture-types.ts";
const run = promisify(execFile);
const options = { windowsHide: true, timeout: 180000, maxBuffer: 8000000 };
export async function normalizeRoleCapture({
  project,
  out,
  viewport,
  openscreen,
  rawProject,
  pointer,
  captureStartedAtMs,
}: {
  captureStartedAtMs: number;
  openscreen: string;
  out: string;
  pointer: Window["tablecastPointerEvents"];
  project: z.infer<typeof screenProject>;
  rawProject: string;
  viewport: { height: number; width: number };
}) {
  const source = project.media.screenVideoPath;
  const dims = videoDimensions.parse(
    JSON.parse(
      (
        await run(
          "ffprobe",
          [
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "json",
            source,
          ],
          options,
        )
      ).stdout,
    ),
  ).streams[0];
  assertCaptureFrame(dims, viewport);
  await run(openscreen, ["pack", rawProject, "--out", resolve(out, "original"), "--json"], options);
  const padX = (1920 - viewport.width) / 2,
    padY = (1080 - viewport.height) / 2;
  const normalized = resolve(out, "tablecast-source.mp4");
  await run(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      source,
      "-vf",
      `crop=${viewport.width}:${viewport.height}:1:81,pad=1920:1080:${padX}:${padY},setsar=1`,
      "-an",
      "-c:v",
      "libx264",
      "-g",
      "30",
      "-keyint_min",
      "30",
      "-sc_threshold",
      "0",
      "-crf",
      "17",
      "-preset",
      "fast",
      normalized,
    ],
    options,
  );
  await writeFile(
    `${normalized}.cursor.json`,
    JSON.stringify(
      {
        version: 2,
        provider: "none",
        assets: [],
        provenance: "Actual Playwright-dispatched DOM events; not OS cursor telemetry",
        samples: pointer
          .filter((e) => e.at >= captureStartedAtMs)
          .map((e) => ({
            timeMs: e.at - captureStartedAtMs,
            cx: (padX + e.x) / 1920,
            cy: (padY + e.y) / 1080,
            visible: true,
            assetId: null,
            cursorType: e.cursorType,
            interactionType: e.interactionType,
          })),
      },
      null,
      2,
    ),
  );
  return { normalized, padX, padY };
}
