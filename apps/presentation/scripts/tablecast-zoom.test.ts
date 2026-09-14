import { expect, test } from "vitest";
import sample from "../sample.json";
import { projectSchema } from "./tablecast-project";
import { fitZoom, zoomRegions, zoomMotion } from "./tablecast-zoom";

const project = projectSchema.parse(sample);
const viewport = { x: 240, y: 0, width: 1440, height: 1080 };

test("発話・cut・元動画トリムからズーム開始を計算する", () => {
  const scene = structuredClone(project.scenes.find((item) => item.id === "readback"));
  if (!scene?.media || !scene.cues[0]) throw new Error("確認の場面がありません");
  expect(zoomRegions([scene], viewport)[0]?.startMs).toBe(122006);
  scene.media.offset += 5;
  scene.cues[0].at += 2;
  expect(zoomRegions([scene], viewport, 1)[0]?.startMs).toBe(130006);
});

test("確認から承認まで保持し、承認のcut内で全体に戻る", () => {
  const regions = zoomRegions(
    project.scenes.filter((scene) => scene.device === "ipad"),
    viewport,
  );
  const confirmation = regions.find((region) => region.id === "tablecast-readback");
  if (!confirmation) throw new Error("確認のズームがありません");
  expect(confirmation?.startMs).toBe(122006);
  expect(confirmation?.endMs).toBe(151683);
  expect(confirmation?.depth).toBe(3);
  expect(confirmation.endMs / 1000 + zoomMotion.exit).toBeLessThan(148.283 + 4.5);
  expect(regions.some((region) => region.id === "tablecast-approval")).toBe(false);
});

test("寄り始めをcut内に残し、読み始めまでの移動と保持を確保する", () => {
  const scene = project.scenes.find((item) => item.id === "consult-answer");
  if (!scene?.media) throw new Error("相談の場面がありません");
  const region = zoomRegions([scene], viewport)[0];
  if (!region) throw new Error("相談のズームがありません");
  const actualStart = region.startMs / 1000 - zoomMotion.lead - scene.media.offset;
  expect(actualStart).toBeCloseTo(0.6, 3);
  expect(region.endMs / 1000 + zoomMotion.exit).toBeLessThan(
    scene.media.offset + scene.media.duration,
  );
  const changed = structuredClone(project);
  const short = changed.scenes.find((item) => item.id === "consult-answer");
  if (!short?.media) throw new Error("相談の場面がありません");
  short.media.duration = 2;
  expect(projectSchema.safeParse(changed).success).toBe(false);
});

test("対象全体と余白が収まり、端を狙っても黒い余白を含まない", () => {
  for (const target of [
    { label: "左上", x: 0, y: 0, width: 0.4, height: 0.3 },
    { label: "右下", x: 0.6, y: 0.7, width: 0.4, height: 0.3 },
    { label: "広い欄", x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  ]) {
    const { x, y, scale, bounds } = fitZoom(target);
    const half = 0.5 / scale;
    expect(x - half).toBeGreaterThanOrEqual(-0.00001);
    expect(y - half).toBeGreaterThanOrEqual(-0.00001);
    expect(x + half).toBeLessThanOrEqual(1.00001);
    expect(y + half).toBeLessThanOrEqual(1.00001);
    expect(bounds.left).toBeGreaterThanOrEqual(x - half - 0.00001);
    expect(bounds.right).toBeLessThanOrEqual(x + half + 0.00001);
    expect(bounds.top).toBeGreaterThanOrEqual(y - half - 0.00001);
    expect(bounds.bottom).toBeLessThanOrEqual(y + half + 0.00001);
  }
  expect(fitZoom({ label: "全体", x: 0, y: 0, width: 1, height: 1 }).scale).toBe(1);
});

test("全体表示の録画区間を継続ズームに巻き込まない", () => {
  const scenes = structuredClone(project.scenes.filter((scene) => scene.device === "ipad"));
  const full = scenes.find((scene) => scene.id === "voice-order");
  if (!full?.media) throw new Error("全体表示の場面がありません");
  full.media.offset = 140;
  expect(() => zoomRegions(scenes, viewport)).toThrow("全体表示の場面を横切ります");
});

test("詳細指定の対象が広すぎるとき、黙ってズームを消さずに停止する", () => {
  const scene = structuredClone(project.scenes.find((item) => item.id === "readback"));
  if (!scene?.media || scene.media.zoom?.mode !== "detail") throw new Error("確認がありません");
  Object.assign(scene.media.zoom.target, { x: 0, y: 0, width: 1, height: 1 });
  expect(() => zoomRegions([scene], viewport)).toThrow("対象が広すぎます");
});

test("定義なし・画面外の対象・異なる対象への継続指定を拒否する", () => {
  const changed = structuredClone(project);
  const scene = changed.scenes.find((item) => item.id === "approval");
  if (!scene?.media || scene.media.zoom?.mode !== "detail") throw new Error("承認がありません");
  scene.media.zoom.target.width = 1;
  expect(projectSchema.safeParse(changed).success).toBe(false);
  scene.media.zoom.target.width = 0.4;
  expect(projectSchema.safeParse(changed).success).toBe(false);
  delete scene.media.zoom;
  expect(projectSchema.safeParse(changed).success).toBe(false);
});
