import { openscreenPath } from "./tablecast-openscreen.ts";
// 保存した店員・管理者の収録を、台本の注目先で再編集する。有料音声や再収録は不要。
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { root, readProject, devices } from "./tablecast-project";
import { screenProject, pointerEvent } from "./tablecast-capture-types";
import { zoomRegions } from "./tablecast-zoom";
import { verifyShotEdit } from "./tablecast-shot";
import { z } from "zod";
import { composeCursor } from "./tablecast-cursor";
import { recordingEdits } from "./tablecast-edit-plan";

const run = promisify(execFile);
const source = await readProject();
const openscreen = openscreenPath();
const options = { windowsHide: true, timeout: 300000, maxBuffer: 8000000 };
for (const { media, device, scenes, sourceTrim, end } of recordingEdits(source, [
  "staff",
  "admin",
])) {
  const edited = resolve(root, media.project);
  const folder = resolve(edited, "..");
  const project = screenProject.parse(JSON.parse(await readFile(edited, "utf8")));
  const viewport = devices[device];
  const x = (1920 - viewport.width) / 2,
    y = (1080 - viewport.height) / 2;
  const recorded = z
    .object({ captureStartedAtMs: z.number(), pointer: z.array(pointerEvent) })
    .parse(JSON.parse(await readFile(resolve(folder, "tablecast-events.json"), "utf8")));
  project.media.screenVideoPath = await composeCursor(
    resolve(folder, "tablecast-source.mp4"),
    recorded.pointer,
    recorded.captureStartedAtMs,
    viewport,
    { x, y, ...viewport },
  );
  for (const scene of scenes.filter((item) => item.capture)) {
    if (!scene.media?.shot) throw new Error(`撮影証跡がありません: ${scene.id}`);
    const take = z
      .object({ status: z.literal("accepted"), scenes: z.array(z.string()) })
      .parse(JSON.parse(await readFile(resolve(folder, "tablecast-take.json"), "utf8")));
    if (!take.scenes.includes(scene.id))
      throw new Error(`採用可能な撮影ではありません: ${scene.id}`);
    verifyShotEdit(
      scene,
      JSON.parse(await readFile(resolve(root, scene.media.shot), "utf8")),
      recorded.captureStartedAtMs,
    );
  }
  project.editor.zoomRegions = zoomRegions(scenes, { x, y, ...viewport }, sourceTrim);
  await writeFile(edited, JSON.stringify(project, null, 2));
  const exported = resolve(folder, "tablecast-openscreen.mp4");
  const result = await run(openscreen, ["export", edited, "--out", exported, "--json"], options);
  await writeFile(resolve(folder, "tablecast-export.log"), result.stdout + result.stderr);
  await run(openscreen, ["pack", edited, "--out", resolve(folder, "portable"), "--json"], options);
  await run(
    "ffmpeg",
    [
      "-v",
      "error",
      "-y",
      "-ss",
      String(sourceTrim),
      "-i",
      exported,
      "-vf",
      `crop=${viewport.width}:${viewport.height}:${x}:${y},fps=30,setsar=1`,
      "-t",
      String(end),
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
      "-movflags",
      "+faststart",
      resolve(root, media.file),
    ],
    options,
  );
  console.info(`${media.file}: ${scenes.length}場面のズームで再書き出し完了`);
}
