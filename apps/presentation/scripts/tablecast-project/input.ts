import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import type { Cue, SpeechCue } from "./scene-schema.ts";
import type { Project } from "./schema.ts";
import { shotSchema } from "../tablecast-shot.ts";
import { defaultProjectPath, projectPath, root } from "./location.ts";
import { projectSchema } from "./schema.ts";

export function needsVoice(item: Project["scenes"][number], part: Cue) {
  return !item.media?.audio && part.voice;
}

export function selectScenes(project: Project, ids?: string) {
  if (!ids) return project;
  const requested = ids.split(",");
  if (new Set(requested).size !== requested.length)
    throw new Error("抽出する場面IDが重複または存在しません");
  return {
    ...project,
    scenes: requested.map((name) => {
      const item = project.scenes.find((part) => part.id === name);
      if (!item) throw new Error("抽出する場面IDが重複または存在しません");
      return item;
    }),
  };
}

export async function readProject() {
  return projectSchema.parse(JSON.parse(await readFile(projectPath(), "utf8")));
}

// 撮影待ちの定義は採用済みの台本へ上書きしない。収録・書き出し成功後に採用する。
export async function readCaptureProject() {
  const project = await readProject();
  const shots = z
    .record(z.string(), shotSchema)
    .parse(
      JSON.parse(
        await readFile(
          process.env.TABLECAST_PRESENTATION_CAPTURE_PLAN
            ? resolve(root, process.env.TABLECAST_PRESENTATION_CAPTURE_PLAN)
            : resolve(
                projectPath() === defaultProjectPath ? root : dirname(projectPath()),
                "capture-plan.json",
              ),
          "utf8",
        ),
      ),
    );
  for (const [sceneId, capture] of Object.entries(shots)) {
    const item = project.scenes.find((candidate) => candidate.id === sceneId);
    if (!item) throw new Error(`撮影対象の場面がありません: ${sceneId}`);
    item.capture = capture;
  }
  return projectSchema.parse(project);
}

export function speechRequest(project: Project, item: SpeechCue) {
  return { ...project.tts, text: item.speech ?? item.text };
}

export function speechHash(project: Project, item: SpeechCue) {
  return createHash("sha256")
    .update(JSON.stringify(speechRequest(project, item)))
    .digest("hex")
    .slice(0, 16);
}

export function audioPath(project: Project, item: SpeechCue) {
  return `assets/audio/${item.id}-${speechHash(project, item)}.wav`;
}
