import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type { Project } from "../tablecast-project.ts";
import type { VideoRun, VideoTiming } from "./types.ts";
import { sha } from "./inputs.ts";
export function validatedPeakDb(log: string) {
  const peak = Number(log.match(/max_volume: ([-.0-9]+) dB/)?.[1]);
  if (!Number.isFinite(peak) || peak <= -91 || peak >= 0)
    throw new Error("音声が無音またはピークを超えています");
  return peak;
}
export async function renderVideo({
  project,
  timing,
  directory,
  paths,
  cli,
  run,
  report,
}: {
  cli: string;
  directory: string;
  paths: { composition: string };
  project: Project;
  report: Record<string, unknown>;
  run: VideoRun;
  timing: VideoTiming;
}) {
  const video = resolve(directory, "video.mp4");
  await run("render", "node", [
    cli,
    "render",
    paths.composition,
    "--output",
    video,
    "--experimental-fast-capture=false",
  ]);
  const probe = await run("metadata", "ffprobe", [
    "-v",
    "error",
    "-show_streams",
    "-show_format",
    "-of",
    "json",
    video,
  ]);
  const metadata = z
    .object({
      format: z.object({ duration: z.coerce.number() }),
      streams: z.array(
        z.object({
          codec_type: z.string(),
          codec_name: z.string(),
          width: z.number().optional(),
          height: z.number().optional(),
          r_frame_rate: z.string().optional(),
        }),
      ),
    })
    .parse(JSON.parse(probe.stdout));
  const visual = metadata.streams.find((s) => s.codec_type === "video");
  const sound = metadata.streams.find((s) => s.codec_type === "audio");
  const hasSound =
    !!project.soundtrack ||
    timing.cues.some((c) => c.audioDuration > 0) ||
    project.scenes.some((s) => s.media?.audio);
  if (
    visual?.width !== project.width ||
    visual.height !== project.height ||
    visual.r_frame_rate !== `${project.fps}/1` ||
    visual.codec_name !== "h264" ||
    (hasSound && sound?.codec_name !== "aac") ||
    Math.abs(metadata.format.duration - timing.duration) > 0.05
  )
    throw new Error("完成MP4の形式・音声・尺が台本と一致しません");
  await run("decode", "ffmpeg", ["-hide_banner", "-v", "error", "-i", video, "-f", "null", "-"]);
  if (hasSound) {
    const volume = await run("volume", "ffmpeg", [
      "-hide_banner",
      "-i",
      video,
      "-af",
      "volumedetect",
      "-vn",
      "-f",
      "null",
      "-",
    ]);
    report.peakDb = validatedPeakDb(volume.stderr);
  }
  const times = [
    ...new Set(
      timing.scenes
        .flatMap((s) => [
          s.start,
          s.start + s.duration / 2,
          s.start + s.duration - 0.1,
          ...(s.technical?.focus.map(
            (f) => s.start + (s.cues.find((c) => c.id === f.cue)?.at ?? 0) + f.offset + 0.5,
          ) ?? []),
        ])
        .map((t) => Math.max(0, Math.min(timing.duration - 0.05, t))),
    ),
  ];
  await mkdir(resolve(directory, "frames"));
  for (const [index, time] of times.entries())
    await run(`frame-${index}`, "ffmpeg", [
      "-v",
      "error",
      "-ss",
      String(time),
      "-i",
      video,
      "-frames:v",
      "1",
      resolve(directory, "frames", `${index}.png`),
    ]);
  report.frames = times.map((time, index) => ({ time, path: `frames/${index}.png` }));
  await writeFile(
    resolve(directory, "player.html"),
    '<!doctype html><html lang="ja"><meta charset="utf-8"><title>完成動画の確認</title><body style="margin:0;background:#000"><video controls playsinline src="video.mp4" style="width:100vw;height:100vh"></video></body></html>',
  );
  const browser = await chromium.launch({
    channel: "chrome",
    args: ["--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required"],
  });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(resolve(directory, "player.html")).href);
    await page.evaluate(async () => {
      const v = document.querySelector("video");
      if (!v) throw new Error("確認する動画がありません");
      v.muted = false;
      v.playbackRate = 1;
      await v.play();
    });
    console.info("playback: 完成MP4を等速で全編再生中");
    await page.waitForFunction(() => document.querySelector("video")?.ended, null, {
      timeout: (timing.duration + 30) * 1000,
    });
    const playback = await page.evaluate(() => {
      const v = document.querySelector("video");
      if (!v) throw new Error("確認する動画がありません");
      return {
        ended: v.ended,
        error: v.error?.code ?? null,
        duration: v.duration,
        muted: v.muted,
        rate: v.playbackRate,
        played: Array.from({ length: v.played.length }, (_, i) => [
          v.played.start(i),
          v.played.end(i),
        ]),
      };
    });
    if (
      playback.error ||
      !playback.ended ||
      playback.muted ||
      playback.rate !== 1 ||
      playback.played.length !== 1 ||
      (playback.played[0]?.[0] ?? 1) > 1 / project.fps ||
      (playback.played[0]?.[1] ?? 0) < timing.duration - 0.05
    )
      throw new Error("完成MP4を全編再生できません");
    report.playback = playback;
  } finally {
    await browser.close();
  }
  report.videoHash = await sha(video);
  report.metadata = metadata;
}
