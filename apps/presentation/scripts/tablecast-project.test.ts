import { expect, test } from "vitest";
import sample from "../sample.json";
import { audioPath, escapeHtml, projectSchema, speechRequest, timeline } from "./tablecast-project";

const file = "assets/demo/tablecast-voice-consult.mp4";
const project = projectSchema.parse({
  ...sample,
  films: undefined,
  scenes: [
    {
      ...sample.scenes[0],
      duration: undefined,
      id: "intro",
      cues: [{ id: "explain", at: 0, text: "APIで検証", speech: "エーピーアイで検証" }],
    },
    {
      ...sample.scenes.find((item) => item.kind === "demo"),
      id: "demo",
      camera: [
        { at: 0, x: 0.5, y: 0.5, zoom: 1 },
        { at: 5, x: 0.75, y: 0.6, zoom: 2.2 },
      ],
      media: { file, offset: 20, duration: 12 },
      cues: [
        { id: "select", at: 0, text: "商品を選択" },
        { id: "submit", at: 6, text: "確認して送信" },
      ],
    },
  ],
});
const durations = { explain: 3.2, select: 4.5, submit: 4 };
const media = { [file]: 40 };

test("実音声で説明の尺を決め、編集した実録と字幕を同じタイムラインに配置する", () => {
  const result = timeline(project, durations, media);
  expect(result.duration).toBe(16);
  expect(result.scenes[1]).toMatchObject({ start: 4, duration: 12, media: { offset: 20 } });
  expect(result.cues[1]).toMatchObject({
    sceneId: "demo",
    start: 4,
    duration: 6,
    audioDuration: 4.5,
  });
  expect(result.cues[2]?.start).toBe(10);
});
test("音声が次の字幕や素材の終端をまたぐと生成を拒否する", () => {
  expect(() => timeline(project, { ...durations, select: 6 }, media)).toThrow("収まりません");
  expect(() => timeline(project, { ...durations, submit: 6 }, media)).toThrow("収まりません");
});
test("実会話の場面は録音の尺を使い、字幕用の有料TTSを必要としない", () => {
  const recorded = structuredClone(project);
  const demo = recorded.scenes[1];
  if (!demo?.media) throw new Error("検証する実録が必要です");
  demo.media.audio = true;
  const result = timeline(recorded, { explain: 3.2 }, media);
  expect(result.duration).toBe(16);
  expect(result.cues.slice(1).map(({ audioDuration }) => audioDuration)).toEqual([0, 0]);
  expect(result.cues[2]).toMatchObject({ start: 10, duration: 6 });
});
test("欠けた音声と不正な音声尺を成功扱いしない", () => {
  expect(() => timeline(project, {}, media)).toThrow("音声尺");
  for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY])
    expect(() => timeline(project, { ...durations, explain: value }, media)).toThrow("音声尺");
});
test("素材範囲外のカットと、場面終了後のカメラ移動を拒否する", () => {
  expect(() => timeline(project, durations, { [file]: 31 })).toThrow("実録映像の範囲");
  expect(() => timeline(project, durations, { [file]: 31.99 })).toThrow("実録映像の範囲");
  expect(() => timeline(project, durations, { [file]: 32 })).not.toThrow();
  expect(() => timeline(project, durations, {})).toThrow("実録映像の範囲");
  const laterCamera = structuredClone(project);
  laterCamera.scenes[0]?.camera.push({ at: 4, x: 0.5, y: 0.5, zoom: 1 });
  expect(() => timeline(laterCamera, durations, media)).toThrow("カメラ");
});
test("表示と配置の変更では再課金せず、発話と声の変更だけが音声キーを変える", () => {
  const item = project.scenes[0]?.cues[0];
  if (!item) throw new Error("検証する発話が必要です");
  expect(speechRequest(project, item).text).toContain("エーピーアイ");
  expect(audioPath(project, item)).toBe(
    audioPath(project, { ...item, text: "表示のみ変更", at: 5 }),
  );
  expect(audioPath(project, item)).not.toBe(audioPath(project, { ...item, speech: "別の読み" }));
  expect(audioPath(project, item)).not.toBe(
    audioPath({ ...project, tts: { ...project.tts, voiceId: "Hina" } }, item),
  );
});
test("重複ID・素材の親参照・逆順の字幕やカメラを拒否する", () => {
  const invalid = structuredClone(project);
  const demo = invalid.scenes[1];
  if (!demo?.media) throw new Error("検証する実録が必要です");
  demo.media.file = "../secret.mp4";
  expect(projectSchema.safeParse(invalid).success).toBe(false);
  demo.media.file = file;
  demo.cues.reverse();
  expect(projectSchema.safeParse(invalid).success).toBe(false);
  demo.cues.reverse();
  demo.camera.reverse();
  expect(projectSchema.safeParse(invalid).success).toBe(false);
  demo.camera.reverse();
  demo.id = "intro";
  expect(projectSchema.safeParse(invalid).success).toBe(false);
});
test("台本文字列をHTMLとして実行しない", () => {
  expect(escapeHtml("<script>\"&'</script>")).toBe("&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;");
});

test("小数の字幕開始時刻でも、終端が次の場面へはみ出さない", () => {
  const intro = project.scenes[0];
  const demo = project.scenes[1];
  if (!intro || !demo?.media) throw new Error("検証する場面が必要です");
  const result = timeline(
    {
      ...project,
      scenes: [
        {
          ...intro,
          duration: 37.1,
          cues: [{ id: "lead", at: 0, text: "導入", speaker: "narrator", voice: true }],
        },
        {
          ...demo,
          camera: [{ at: 0, x: 0.5, y: 0.5, zoom: 1 }],
          media: { ...demo.media, duration: 12 },
          cues: [
            { id: "price", at: 8.3, text: "単価は780円です。", speaker: "narrator", voice: true },
          ],
        },
        {
          ...intro,
          id: "pause",
          duration: 6.2,
          cues: [
            {
              id: "pause-voice",
              at: 0,
              text: "音声を止めます。",
              speaker: "narrator",
              voice: true,
            },
          ],
        },
      ],
    },
    { lead: 1, price: 1, "pause-voice": 1 },
    { [file]: 1000 },
  );
  const price = result.cues[1];
  const pause = result.cues[2];
  if (!price || !pause) throw new Error("検証する字幕が必要です");
  expect(price.start + price.duration).toBe(pause.start);
});

test("実録の冒頭は画面全体を保ち、最初から一部だけを見せない", () => {
  const invalid = structuredClone(project);
  const camera = invalid.scenes[1]?.camera;
  if (!camera?.[0] || !camera[1]) throw new Error("検証するカメラが必要です");
  camera[0].zoom = 1.5;
  expect(projectSchema.safeParse(invalid).success).toBe(false);
  camera[0].zoom = 1;
  camera[1].at = 2.3;
  expect(projectSchema.safeParse(invalid).success).toBe(false);
  camera[1].at = 3.4;
  expect(projectSchema.safeParse(invalid).success).toBe(true);
});
