import type { z } from "zod";
import type { projectDefinition } from "./schema.ts";
import { zoomMotion } from "../tablecast-zoom.ts";
import { cameraTransitionDuration } from "./display.ts";

export function validateProject(project: z.infer<typeof projectDefinition>, ctx: z.RefinementCtx) {
  if (project.soundtrack && project.soundtrack.speechVolume > project.soundtrack.musicVolume)
    ctx.addIssue({
      code: "custom",
      path: ["soundtrack", "speechVolume"],
      message: "発話中のBGM音量は通常時のBGM音量以下にしてください",
    });
  const ids = project.scenes.flatMap((item) => [item.id, ...item.cues.map((part) => part.id)]);
  if (new Set(ids).size !== ids.length)
    ctx.addIssue({ code: "custom", message: "場面・発話IDは重複できません" });
  for (const film of Object.values(project.films ?? {})) {
    if (
      new Set(film.scenes).size !== film.scenes.length ||
      film.scenes.some((name) => !project.scenes.some((item) => item.id === name))
    )
      ctx.addIssue({ code: "custom", message: "動画は重複のない実在する場面を参照してください" });
  }
  for (const [sceneIndex, item] of project.scenes.entries()) {
    const issue = (field: string, message: string) =>
      ctx.addIssue({ code: "custom", path: ["scenes", sceneIndex, field], message });
    if (item.sourceHeading && !item.sourceTree)
      issue("sourceHeading", "ファイル一覧の見出しにはsourceTreeが必要です");
    if (
      [item.technical, item.diagram, item.sourceTree, item.images, item.media].filter(Boolean)
        .length > 1
    )
      issue("kind", "技術図・構成図・ファイル一覧・静止画・動画は同じ場面に重ねて指定できません");
    if (item.kind === "title" && item.images && item.images.length !== 1)
      issue("images", "導入の静止画は1枚だけ指定してください");
    if ((item.technical || item.diagram) && item.points.length)
      issue("points", "図の説明は図内の要素・注目先に指定してください");
    if (item.kind === "demo" && !item.points.length)
      issue("points", "実録には操作の説明を1件以上指定してください");
    if (item.pointFocus && item.kind !== "demo" && !(item.kind === "result" && item.images))
      issue("pointFocus", "説明の強調は実録または静止画付きのまとめに指定してください");
    if (
      item.kind === "result" &&
      item.images &&
      item.pointFocus &&
      item.images.some((_, point) => !item.pointFocus?.some((focus) => focus.point === point))
    )
      issue("pointFocus", "まとめの静止画をすべて表示する強調時刻を指定してください");
    if (
      item.kind === "result" &&
      item.pointFocus?.some(
        (focus, index) => index > 0 && focus.point === item.pointFocus?.[index - 1]?.point,
      )
    )
      issue("pointFocus", "まとめの同じ画像を連続した注目先に指定できません");
    if (
      item.kind !== "demo" &&
      (item.camera.length !== 1 ||
        item.camera[0]?.x !== 0.5 ||
        item.camera[0]?.y !== 0.5 ||
        item.camera[0]?.zoom !== 1)
    )
      issue("camera", "カメラ移動は実録場面だけに指定してください");
    if (item.duration && item.media)
      issue("duration", "実録の尺はmedia.durationだけで指定してください");
    if (Boolean(item.device) !== Boolean(item.role) || (item.device && item.kind !== "demo"))
      issue("device", "実録の端末と役割は一緒に指定してください");
    if (item.images && item.kind !== "title" && item.kind !== "result")
      issue("images", "静止画は導入またはまとめの場面に指定してください");
    if (item.kind === "result" && item.images && item.images.length !== item.points.length)
      issue("images", "まとめの静止画と説明は一対一にしてください");
    if (item.media?.project && (item.camera.length !== 1 || item.camera[0]?.zoom !== 1))
      issue("camera", "OpenScreen済み素材へ二重ズームを指定できません");
    if (item.capture && (!item.device || !item.media))
      issue("capture", "撮影定義は役割と端末のある実録場面に指定してください");
    for (const track of [
      item.technical?.focus,
      item.diagram?.focus,
      item.media?.zoom?.mode === "detail" ? [item.media.zoom] : undefined,
    ]) {
      if (!track) continue;
      const starts = track.map(
        (focus) => (item.cues.find((part) => part.id === focus.cue)?.at ?? 0) + focus.offset,
      );
      if (
        track.some((focus) => !item.cues.some((part) => part.id === focus.cue)) ||
        starts.some((start, index) => index > 0 && start <= (starts[index - 1] ?? 0))
      )
        issue("focus", "注目先は実在する発話を参照し、時刻を昇順に指定してください");
    }
    if (item.media?.zoom?.mode === "detail" && !item.media.project)
      issue("media", "素材の注目先にはOpenScreen projectが必要です");
    if (item.media?.project && !item.media.zoom)
      issue("media", "実録にはズームの判断と理由を指定してください");
    const zoom = item.media?.zoom;
    if (zoom?.mode === "detail") {
      const enterAt = (item.cues.find((part) => part.id === zoom.cue)?.at ?? 0) + zoom.offset;
      const sceneDuration = item.media?.duration ?? 0;
      const holdEnd = zoom.exitAt ?? sceneDuration;
      if (
        (!zoom.continueFrom && enterAt + zoomMotion.enter + 0.6 > holdEnd) ||
        (zoom.exitAt !== undefined && zoom.exitAt + zoomMotion.exit > sceneDuration)
      )
        issue("media", "ズームの移動・保持・引きを場面内に確保してください");
      if (zoom.target.x + zoom.target.width > 1 || zoom.target.y + zoom.target.height > 1)
        issue("media", "ズーム対象の範囲が画面外です");
      if (zoom.continueFrom) {
        const previous = project.scenes.find((candidate) => candidate.id === zoom.continueFrom);
        if (
          !previous?.media ||
          previous.media.file !== item.media?.file ||
          previous.media.offset >= (item.media?.offset ?? 0) ||
          previous.media.zoom?.mode !== "detail" ||
          JSON.stringify(previous.media.zoom.target) !== JSON.stringify(zoom.target)
        )
          issue("media", "継続ズームは同じ素材・対象の先行場面を参照してください");
      }
    }
    if (item.diagram) {
      const diagram = item.diagram;
      const nodes = diagram.columns.flatMap((column) => column.nodes.map((node) => node.id));
      if (
        item.kind !== "flow" ||
        new Set(nodes).size !== nodes.length ||
        diagram.focus.some((focus) => focus.targets.some((target) => !nodes.includes(target))) ||
        diagram.links.some(
          (link) => !nodes.includes(link.from) || !nodes.includes(link.to) || link.from === link.to,
        )
      )
        issue("diagram", "技術図の要素IDと接続・注目先を確認してください");
    }
    if ((item.kind === "demo") !== Boolean(item.media))
      issue("media", "実録場面だけに動画素材を指定してください");
    if (item.kind === "demo") {
      const initial = item.camera[0];
      if (initial?.x !== 0.5 || initial.y !== 0.5 || initial.zoom !== 1)
        issue("camera", "実録場面は画面全体から始めてください");
      // キーフレームは到達時刻。実際の移動開始まで全体表示を2.3秒保つ。
      if (item.camera[1] && item.camera[1].at < 2.3 + cameraTransitionDuration)
        issue("camera", "冒頭の全体表示を保ってから拡大してください");
    }
    for (const track of [item.cues, item.camera]) {
      if (
        track[0]?.at !== 0 ||
        track.some((part, index, all) => index > 0 && part.at <= (all[index - 1]?.at ?? 0))
      )
        issue("timeline", "字幕・カメラは0秒から昇順に配置してください");
    }
  }
}
