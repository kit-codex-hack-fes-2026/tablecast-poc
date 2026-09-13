// OpenScreenの標準version 2 projectを編集し、同じCLIで書き出す。
// 元録画・実際のイベントを保ち、画面と音声の開始時刻だけを合わせる。
import { execFile } from "node:child_process";
import { readFile, writeFile, access } from "node:fs/promises";
import { resolve, win32 } from "node:path";
import { promisify } from "node:util";
import { screenProject, captureEvents, videoDimensions } from "./tablecast-capture-types.ts";
import { zoomRegions } from "./tablecast-zoom.ts";
import { readProject, projectPath } from "./tablecast-project.ts";
import { bindShotZoom } from "./tablecast-shot.ts";
import { z } from "zod";
import { recordingEdits } from "./tablecast-edit-plan.ts";
import { composeCursor } from "./tablecast-cursor.ts";
const run = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const project = await readProject();
const openscreen = resolve(process.env.LOCALAPPDATA ?? "", "Programs/Openscreen/Openscreen.exe");
const options = { windowsHide: true, timeout: 300000, maxBuffer: 8000000 };
for (const { media: guest, scenes } of recordingEdits(project, ["customer"])) {
  const out = resolve(root, guest.project, "..");
  const original = screenProject.parse(
    JSON.parse(await readFile(resolve(out, "tablecast-raw.openscreen"), "utf8")),
  );
  const events = captureEvents.parse(
    JSON.parse(await readFile(resolve(out, "tablecast-events.json"), "utf8")),
  );
  const log = await readFile(resolve(out, "tablecast-record.log"), "utf8");
  const captureStartedAtMs = Number(log.match(/"captureStartedAtMs":(\d+)/)?.[1]);
  if (!Number.isFinite(captureStartedAtMs) || original.version !== 2)
    throw new Error("開始時刻付きのOpenScreen v2録画が必要です");
  const audioOffset = (captureStartedAtMs - events.audioStartedAt) / 1000;
  // 新しいcheckoutでは同梱した原録画を優先する。新規収録直後だけ録画先を使う。
  let source = resolve(out, "original", win32.basename(original.media.screenVideoPath));
  try {
    await access(source);
  } catch {
    source = resolve(out, original.media.screenVideoPath);
    await access(source);
  }
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
  if (dims.width !== 1026 || dims.height !== 850)
    throw new Error("Chromeのclient領域が実測済み配置と異なります");
  const normalized = resolve(out, "tablecast-source.mp4");
  // 音声や開始時刻を変更した再編集でも、古い前処理キャッシュを流用しない。
  console.info("画面の比率・実音声の時刻・音量を調整");
  await run(
    "ffmpeg",
    [
      "-v",
      "error",
      "-y",
      "-i",
      source,
      "-ss",
      String(audioOffset),
      "-i",
      resolve(out, "tablecast-audio.webm"),
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-vf",
      "crop=1024:768:1:81,scale=1440:1080,pad=1920:1080:240:0,setsar=1",
      "-af",
      "loudnorm=I=-16:TP=-1.5:LRA=11",
      "-shortest",
      "-c:v",
      "libx264",
      "-crf",
      "17",
      "-preset",
      "fast",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
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
        provenance:
          "Actual Playwright-dispatched DOM pointer events, preserved in tablecast-events.json; not OS cursor telemetry",
        samples: events.pointer
          .filter((e) => e.at >= captureStartedAtMs)
          .map((e) => ({
            timeMs: e.at - captureStartedAtMs,
            cx: (240 + (e.x / 1024) * 1440) / 1920,
            cy: e.y / 768,
            assetId: null,
            visible: true,
            cursorType: e.cursorType,
            interactionType: e.interactionType,
          })),
      },
      null,
      2,
    ),
  );
  if (scenes.some((scene) => scene.capture)) {
    const take = z
      .object({ status: z.literal("accepted"), scenes: z.array(z.string()) })
      .parse(JSON.parse(await readFile(resolve(out, "tablecast-take.json"), "utf8")));
    for (const scene of scenes.filter((item) => item.capture)) {
      if (!scene.media?.shot || !take.scenes.includes(scene.id))
        throw new Error(`採用可能な撮影証跡がありません: ${scene.id}`);
      bindShotZoom(
        scene,
        JSON.parse(await readFile(resolve(root, scene.media.shot), "utf8")),
        captureStartedAtMs,
      );
    }
  }
  const zoom = zoomRegions(scenes, { x: 240, y: 0, width: 1440, height: 1080 });
  const cursorSource = await composeCursor(
    normalized,
    events.pointer,
    captureStartedAtMs,
    { width: 1024, height: 768 },
    { x: 240, y: 0, width: 1440, height: 1080 },
  );
  Object.assign(original.media, { screenVideoPath: cursorSource });
  Object.assign(original.editor, {
    padding: 0,
    borderRadius: 0,
    shadowIntensity: 0,
    motionBlurAmount: 0.1,
    autoZoomEnabled: false,
    aspectRatio: "16:9",
    cropRegion: { x: 0, y: 0, width: 1, height: 1 },
    zoomRegions: zoom,
  });
  const edited = resolve(root, guest.project);
  await writeFile(edited, JSON.stringify(original, null, 2));
  console.info("OpenScreenで実カーソルイベントと手動ズームを書き出し");
  const exported = resolve(out, "tablecast-openscreen.mp4");
  const result = await run(openscreen, ["export", edited, "--out", exported, "--json"], options);
  await writeFile(resolve(out, "tablecast-export.log"), result.stdout + result.stderr);
  const packed = resolve(out, "portable");
  await run(openscreen, ["pack", edited, "--out", packed, "--json"], options);
  await run(
    "ffmpeg",
    [
      "-v",
      "error",
      "-y",
      "-i",
      exported,
      "-vf",
      "crop=1440:1080:240:0,fps=30,setsar=1",
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
      "-c:a",
      "copy",
      "-movflags",
      "+faststart",
      resolve(root, guest.file),
    ],
    options,
  );
  console.info("iPad素材の書き出し完了");
}
await writeFile(projectPath(), JSON.stringify(project, null, 2));
