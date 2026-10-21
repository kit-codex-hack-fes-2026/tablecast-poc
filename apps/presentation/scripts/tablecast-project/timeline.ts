import type { Cue } from "./scene-schema.ts";
import type { Project } from "./schema.ts";
import { recapFocus, recapHandoffDuration } from "./display.ts";
import { needsVoice } from "./input.ts";

export function timeline(
  project: Project,
  audioDurations: Record<string, number>,
  mediaDurations: Record<string, number>,
) {
  let start = 0;
  const cues: (Cue & {
    audioDuration: number;
    duration: number;
    sceneId: string;
    start: number;
  })[] = [];
  const scenes = project.scenes.map((item) => {
    const spoken = item.cues.map((part) => {
      // 実会話の字幕にはTTSを重ねず、録画自身の音声を再生する。
      const voiced = needsVoice(item, part);
      const audioDuration = voiced ? audioDurations[part.id] : 0;
      if (
        audioDuration === undefined ||
        !Number.isFinite(audioDuration) ||
        (voiced && audioDuration <= 0)
      )
        throw new Error(`音声尺が不正です: ${part.id}`);
      return { ...part, audioDuration };
    });
    const duration =
      item.media?.duration ??
      item.duration ??
      Math.ceil(
        Math.max(...spoken.map((part) => part.at + part.audioDuration + 0.8)) * project.fps - 1e-7,
      ) / project.fps;
    if (item.media) {
      const available = mediaDurations[item.media.file];
      if (
        !available ||
        !Number.isFinite(available) ||
        item.media.offset + duration > available + 0.000001
      )
        throw new Error(`実録映像の範囲を超えています: ${item.id}`);
    }
    if (item.camera.some((position) => position.at >= duration))
      throw new Error(`カメラが場面の尺を超えています: ${item.id}`);
    if (
      item.pointFocus?.some(
        (focus, index, all) =>
          focus.at >= duration ||
          focus.point >= item.points.length ||
          (index > 0 && focus.at <= (all[index - 1]?.at ?? 0)),
      )
    )
      throw new Error(`説明の強調は実在する項目と場面内の昇順時刻が必要です: ${item.id}`);
    if (item.kind === "result" && item.images) {
      const focus = recapFocus(item);
      if (focus.some((entry) => entry.at + 0.2 > duration - recapHandoffDuration))
        throw new Error(`まとめの静止画を表示してから結論へ切り替える尺が必要です: ${item.id}`);
    }
    spoken.forEach((part, index) => {
      const cueStart = start + part.at;
      const cueEnd = start + (item.cues[index + 1]?.at ?? duration);
      // 相対時刻同士の差を再加算すると、切替で字幕が微小に重なる場合がある。
      // 次の字幕・場面と同じ絶対終端から表示尺を求める。
      const slot = cueEnd - cueStart;
      const audioDuration = part.audioDuration;
      if (audioDuration + 0.2 > slot)
        throw new Error(`字幕・音声が場面または次の字幕区間に収まりません: ${part.id}`);
      cues.push({
        ...part,
        sceneId: item.id,
        start: cueStart,
        duration: slot,
        audioDuration,
      });
    });
    for (const focus of [
      ...(item.technical?.focus ?? []),
      ...(item.diagram?.focus ?? []),
      ...((item.media?.zoom?.mode === "detail" ? [item.media.zoom] : undefined) ?? []),
    ]) {
      const index = spoken.findIndex((part) => part.id === focus.cue);
      const part = spoken[index];
      const end = spoken[index + 1]?.at ?? duration;
      if (
        !part ||
        part.at + focus.offset >= end ||
        (part.audioDuration > 0 && focus.offset >= part.audioDuration)
      )
        throw new Error(`図の強調が対応する発話を超えています: ${focus.cue}`);
    }
    const timed = { ...item, start, duration };
    start += duration;
    return timed;
  });
  return { scenes, cues, duration: start };
}
