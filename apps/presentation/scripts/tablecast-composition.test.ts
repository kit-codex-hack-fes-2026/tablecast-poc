import { expect, test } from "vitest";
import sample from "../sample.json";
import { musicEnvelope } from "./tablecast-composition";
import { audioPath, projectSchema, selectScenes, timeline } from "./tablecast-project";

import { technicalMarkup } from "./tablecast-technical";

const project = projectSchema.parse(sample);

test("2本は重複しない場面から生成する", () => {
  const films = Object.values(project.films ?? {});
  expect(films).toHaveLength(2);
  const ids = films.flatMap((film) => film.scenes);
  expect(new Set(ids).size).toBe(ids.length);
});

test("技術編は固定60秒に合わせず、音声尺の変更に追従する", () => {
  const film = project.films?.technical;
  if (!film) throw new Error("技術編が必要です");
  const chosen = selectScenes(project, film.scenes.join(","));
  const durations = Object.fromEntries(
    chosen.scenes.flatMap((scene) =>
      scene.cues.map((part) => [
        part.id,
        Math.max(
          1,
          ...(scene.technical?.focus ?? [])
            .filter((panel) => panel.cue === part.id)
            .map((panel) => panel.offset + 1),
        ),
      ]),
    ),
  );
  const duration = timeline(chosen, durations, {}).duration;
  expect(film.duration).toBeUndefined();
  const longer = Object.fromEntries(
    Object.entries(durations).map(([id, length]) => [id, length + 2]),
  );
  expect(timeline(chosen, longer, {}).duration - duration).toBeCloseTo(chosen.scenes.length * 2, 5);
});

test("部分抽出は指定順に0秒から始まり、不明・重複IDを拒否する", () => {
  const chosen = selectScenes(project, "tech-evidence,tech-intro");
  expect(chosen.scenes.map((scene) => scene.id)).toEqual(["tech-evidence", "tech-intro"]);
  expect(
    timeline(chosen, { "tech-evidence-voice": 14, "tech-intro-voice": 9 }, {}).scenes[0]?.start,
  ).toBe(0);
  expect(() => selectScenes(project, "tech-intro,missing")).toThrow("存在しません");
  expect(() => selectScenes(project, "tech-intro,tech-intro")).toThrow("重複");
});

test("話者名・図・端末配置の変更は課金済み音声キーを変えない", () => {
  const cue = project.scenes[0]?.cues[0];
  if (!cue) throw new Error("発話が必要です");
  expect(audioPath(project, cue)).toBe(
    audioPath(project, { ...cue, speaker: "cast", at: 2, voice: false }),
  );
});

test("OpenScreen済み素材に二重ズームを付けると拒否する", () => {
  const changed = structuredClone(project);
  const scene = changed.scenes.find((item) => item.media);
  if (!scene?.media) throw new Error("実録が必要です");
  scene.media.project = "assets/openscreen/tablecast-ipad/tablecast-ipad-edit.openscreen";
  scene.camera.push({ at: 4, x: 0.5, y: 0.5, zoom: 2 });
  expect(projectSchema.safeParse(changed).success).toBe(false);
});

test("技術図の切り替えは実在する発話の区間内で指定する", () => {
  const chosen = selectScenes(project, "tech-order");
  const scene = chosen.scenes[0];
  if (!scene?.technical) throw new Error("図が必要です");
  const timed = timeline(chosen, { "tech-order-voice": 14 }, {});
  const timedScene = timed.scenes[0];
  if (!timedScene) throw new Error("場面が必要です");
  expect(technicalMarkup(timedScene, "tablecast-test").html).not.toMatch(/NaN|Infinity/);
  expect(() => timeline(chosen, { "tech-order-voice": 4 }, {})).toThrow("発話を超えています");
  const panel = scene.technical.focus[0];
  if (!panel) throw new Error("図の場面が必要です");
  panel.cue = "missing";
  expect(projectSchema.safeParse({ ...chosen, films: undefined }).success).toBe(false);
});

test("全構成を残し、実在する要素を発話に合わせて指し示す", () => {
  const chosen = selectScenes(project, "tech-architecture");
  const scene = timeline(chosen, { "tech-architecture-voice": 13.44 }, {}).scenes[0];
  if (!scene?.technical) throw new Error("図が必要です");
  const { html, animations } = technicalMarkup(scene, "tablecast-test");
  expect(html).toContain("Store DO");
  expect(html).toContain("Service Binding");
  expect(html).toContain("tech-trace");
  expect(animations.join("\n")).toContain("tablecast-test-tech-model");
  const focus = scene.technical.focus[1];
  if (!focus) throw new Error("注目先が必要です");
  focus.offset = 0;
  expect(projectSchema.safeParse({ ...chosen, films: undefined }).success).toBe(false);
  focus.offset = 3.2;
  focus.targets = ["missing"];
  expect(projectSchema.safeParse({ ...chosen, films: undefined }).success).toBe(false);
});

test.each([
  { musicVolume: 0.05, speechVolume: 0.1, accepted: false },
  { musicVolume: 0, speechVolume: 0.05, accepted: false },
  { musicVolume: 0.1, speechVolume: 0.05, accepted: true },
  { musicVolume: 0.05, speechVolume: 0.05, accepted: true },
  { musicVolume: 0, speechVolume: 0, accepted: true },
])(
  "BGM設定は通常時$musicVolume・発話中$speechVolumeで受理=$accepted",
  ({ musicVolume, speechVolume, accepted }) => {
    const result = projectSchema.safeParse({
      ...sample,
      soundtrack: { ...sample.soundtrack, musicVolume, speechVolume },
    });
    expect(result.success).toBe(accepted);
    expect(result.error?.issues.map((issue) => issue.path) ?? []).toEqual(
      accepted ? [] : [["soundtrack", "speechVolume"]],
    );
  },
);

test("BGMは発話中に下がり、各clip相対の範囲内で全編の冒頭と末尾を無音にする", () => {
  const chosen = selectScenes(project, "tech-intro");
  const timed = timeline(chosen, { "tech-intro-voice": 9 }, {});
  const sound = project.soundtrack;
  if (!sound) throw new Error("音設定が必要です");
  const split = timed.duration / 2;
  const first = musicEnvelope(timed, sound, 0, split).lanes[0]?.points ?? [];
  const last = musicEnvelope(timed, sound, split, timed.duration - split).lanes[0]?.points ?? [];
  expect(first[0]?.v).toBe(0);
  expect(first.find((point) => point.t === 0.5)?.v).toBe(sound.speechVolume);
  expect(last.at(-1)?.v).toBe(0);
  for (const points of [first, last]) {
    expect(
      points.every(
        (point, index) =>
          point.t >= 0 &&
          point.v >= 0 &&
          point.v <= sound.musicVolume &&
          (index === 0 || point.t > (points[index - 1]?.t ?? 0)),
      ),
    ).toBe(true);
  }
});
