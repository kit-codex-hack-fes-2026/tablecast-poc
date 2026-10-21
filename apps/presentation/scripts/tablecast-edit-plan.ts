import { dirname } from "node:path";
import type { Project } from "./tablecast-project";

type Scene = Project["scenes"][number];
type Edit = {
  media: NonNullable<Scene["media"]> & { project: string };
  device: NonNullable<Scene["device"]>;
  scenes: Scene[];
  sourceTrim: number;
  end: number;
};

// 同じ素材の全カットを一度に編集し、後続場面によるズーム・尺の上書きを防ぐ。
export function recordingEdits(project: Project, roles: NonNullable<Scene["role"]>[]) {
  const edits = new Map<string, Edit>();
  const folders = new Map<string, string>();
  for (const scene of project.scenes.filter((item) => item.role && roles.includes(item.role))) {
    const media = scene.media;
    if (!media?.project || !scene.device)
      throw new Error(`編集元のprojectと端末が必要です: ${scene.id}`);
    if (scene.role === "customer" && scene.device !== "ipad")
      throw new Error(`客側の再編集は実測済みのipad録画だけに対応しています: ${scene.id}`);
    if (scene.role !== "customer" && media.audio)
      throw new Error(`店舗側の再編集は無音素材だけに対応しています: ${scene.id}`);
    const folder = dirname(media.project);
    const owner = folders.get(folder);
    if (owner && owner !== media.file)
      throw new Error(`編集フォルダを異なる出力素材で共有できません: ${folder}`);
    folders.set(folder, media.file);
    const sourceTrim = scene.role === "customer" || scene.capture ? 0 : 1;
    const edit = edits.get(media.file);
    if (edit) {
      if (
        edit.media.project !== media.project ||
        edit.device !== scene.device ||
        edit.sourceTrim !== sourceTrim
      )
        throw new Error(`同じ素材の編集元・端末・先頭カットが一致しません: ${scene.id}`);
      edit.scenes.push(scene);
      edit.end = Math.max(edit.end, media.offset + media.duration);
    } else {
      edits.set(media.file, {
        media: { ...media, project: media.project },
        device: scene.device,
        scenes: [scene],
        sourceTrim,
        end: media.offset + media.duration,
      });
    }
  }
  if (!edits.size) throw new Error(`対象の録画がありません: ${roles.join(", ")}`);
  for (const scene of project.scenes) {
    const owner = scene.media?.project && folders.get(dirname(scene.media.project));
    if (owner && owner !== scene.media?.file)
      throw new Error(`編集フォルダを別の素材の場面が参照しています: ${scene.id}`);
    const edit = scene.media && edits.get(scene.media.file);
    if (edit && !edit.scenes.includes(scene))
      throw new Error(`同じ素材を別の役割の場面が参照しています: ${scene.id}`);
  }
  return [...edits.values()];
}
