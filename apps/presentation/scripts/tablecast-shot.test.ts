import { expect, test } from "vitest";
import {
  shotSchema,
  shotHash,
  subjectMatches,
  verifyShot,
  bindShotZoom,
  verifyShotEdit,
} from "./tablecast-shot";
import { projectSchema } from "./tablecast-project";
import sample from "../sample.json";
const shot = shotSchema.parse({
  intent: "注文した商品の数量と金額",
  subject: { selector: "[data-ui=cart-lines] > li", required: ["数量 1", "780"] },
  hold: 4,
});
const target = { label: shot.intent, x: 0.5, y: 0.2, width: 0.45, height: 0.3 };
test.each(["[", "(", "\\"])("撮影の正規表現%sを計画の読込時点で拒否する", (pattern) => {
  const text = shotSchema.safeParse({ ...shot, subject: { ...shot.subject, text: pattern } });
  const required = shotSchema.safeParse({
    ...shot,
    subject: { ...shot.subject, required: [pattern] },
  });
  expect(text.error?.issues).toContainEqual(
    expect.objectContaining({ path: ["subject", "text"], message: "撮影の正規表現が不正です" }),
  );
  expect(required.error?.issues).toContainEqual(
    expect.objectContaining({
      path: ["subject", "required", 0],
      message: "撮影の正規表現が不正です",
    }),
  );
});
const evidence = {
  sceneId: "added",
  definition: shotHash(shot),
  readyAt: 1000,
  endAt: 5100,
  target,
  text: "数量 1 · ￥780",
  image: "tablecast-shot-added.png",
};
test("必要な文字があっても画面外に欠けていれば撮影成立にしない", () => {
  expect(subjectMatches(shot, { ...target, text: evidence.text, visible: false })).toBe(false);
  expect(subjectMatches(shot, { ...target, text: "数量 1", visible: true })).toBe(false);
  expect(subjectMatches(shot, { ...target, text: evidence.text, visible: true })).toBe(true);
});
test("撮影したい情報や操作が変わると古い証跡を採用しない", () => {
  expect(verifyShot("added", shot, evidence)).toEqual(evidence);
  const changed = structuredClone(shot);
  changed.subject.required = ["数量 2", "780"];
  expect(() => verifyShot("added", changed, evidence)).toThrow("再撮影");
  expect(() => verifyShot("other", shot, evidence)).toThrow("再撮影");
});
test("表示文言不足と短すぎる保持は採用時にも拒否する", () => {
  expect(() => verifyShot("added", shot, { ...evidence, text: "数量 1" })).toThrow("不足");
  expect(() => verifyShot("added", shot, { ...evidence, endAt: 2000 })).toThrow("不足");
});
test("実測の位置と表示時刻からズームを配置し、ずれた編集や短い切り出しを拒否する", () => {
  const scene = structuredClone(
    projectSchema.parse(sample).scenes.find((item) => item.id === "admin"),
  );
  if (!scene?.media) throw new Error("管理画面のテスト素材がありません");
  scene.id = "added";
  scene.capture = shot;
  scene.cues = [{ id: "explain", at: 0, text: "注文", speaker: "narrator", voice: true }];
  scene.media.offset = 0;
  scene.media.duration = 7;
  scene.media.zoom = { mode: "detail", cue: "explain", offset: 0, target, reason: "数量と金額" };
  bindShotZoom(scene, evidence, 0);
  expect(scene.media?.zoom).toMatchObject({ offset: 1, exitAt: 5.1, target });
  expect(() => verifyShotEdit(scene, evidence, 0)).not.toThrow();
  const changed = structuredClone(scene);
  if (!changed.media) throw new Error("テスト素材がありません");
  changed.media.offset = 0.5;
  expect(() => verifyShotEdit(changed, evidence, 0)).toThrow("再編集");
  changed.media.offset = 2;
  expect(() => bindShotZoom(changed, evidence, 0)).toThrow("切り出し");
});
