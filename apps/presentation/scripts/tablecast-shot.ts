import { z } from "zod";
import { createHash } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Project } from "./tablecast-project.ts";
import { fitZoom, zoomMotion } from "./tablecast-zoom.ts";
const capturePattern = z.string().refine((pattern) => {
  try {
    RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}, "撮影の正規表現が不正です");

// 撮影の目的・画面操作・成立条件を台本に置く。編集の対象矩形は撮影時に測る。
export const shotSchema = z.object({
  intent: z.string().min(1),
  state: z.string().min(1).optional(),
  steps: z
    .array(z.object({ role: z.enum(["button", "tab", "link"]), name: z.string().min(1) }))
    .default([]),
  subject: z.object({
    selector: z.string().min(1),
    text: capturePattern.optional(),
    required: z.array(capturePattern.min(1)).min(1),
  }),
  hold: z.number().min(2.5).max(30),
});
export type Shot = z.infer<typeof shotSchema>;
export const shotEvidenceSchema = z.object({
  sceneId: z.string(),
  definition: z.string(),
  readyAt: z.number(),
  endAt: z.number(),
  target: z
    .object({
      label: z.string(),
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().positive().max(1),
      height: z.number().positive().max(1),
    })
    .refine((box) => box.x + box.width <= 1.001 && box.y + box.height <= 1.001, "対象が画面外です"),
  text: z.string(),
  image: z.string(),
});
export type ShotEvidence = z.infer<typeof shotEvidenceSchema>;
export const shotHash = (shot: Shot) =>
  createHash("sha256").update(JSON.stringify(shot)).digest("hex");
export function verifyShot(sceneId: string, shot: Shot, input: unknown) {
  const evidence = shotEvidenceSchema.parse(input);
  if (evidence.sceneId !== sceneId || evidence.definition !== shotHash(shot))
    throw new Error(`撮影定義が変わっています。再撮影してください: ${sceneId}`);
  if (
    evidence.endAt - evidence.readyAt < shot.hold * 1000 ||
    !subjectMatches(shot, { ...evidence.target, text: evidence.text, visible: true })
  )
    throw new Error(`撮影に必要な情報または保持時間が不足しています: ${sceneId}`);
  return evidence;
}
// 音声を含む切り出しは台本側で決め、実測区間をその中に保てる場合だけ寄りを配置する。
export function bindShotZoom(
  scene: Project["scenes"][number],
  input: unknown,
  sourceStart: number,
) {
  if (!scene.capture || !scene.media) throw new Error(`撮影定義と素材が必要です: ${scene.id}`);
  const evidence = verifyShot(scene.id, scene.capture, input);
  if (!Number.isFinite(sourceStart)) throw new Error("録画開始時刻がありません");
  const ready = (evidence.readyAt - sourceStart) / 1000 - scene.media.offset;
  const end = (evidence.endAt - sourceStart) / 1000 - scene.media.offset;
  if (ready < 0 || end > scene.media.duration)
    throw new Error(`必要な表示区間が切り出しに収まりません: ${scene.id}`);
  const zoom = scene.media.zoom;
  if (zoom?.mode === "detail") {
    const cue = scene.cues.find((item) => item.id === zoom.cue);
    if (
      !cue ||
      ready < cue.at ||
      end + zoomMotion.exit > scene.media.duration ||
      ready + zoomMotion.enter + 0.6 > end
    )
      throw new Error(`撮影区間と発話・ズームの尺を合わせてください: ${scene.id}`);
    if (fitZoom(evidence.target).scale === 1)
      throw new Error(`ズーム対象が広すぎます。撮影対象を分割してください: ${scene.id}`);
    zoom.target = evidence.target;
    zoom.offset = ready - cue.at;
    zoom.exitAt = end;
    // 別の実測区間を旧素材の継続ズームへ暗黙に連結しない。
    delete zoom.continueFrom;
  }
  return evidence;
}

export function verifyShotEdit(
  scene: Project["scenes"][number],
  input: unknown,
  sourceStart: number,
) {
  const expected = structuredClone(scene);
  bindShotZoom(expected, input, sourceStart);
  if (JSON.stringify(expected.media?.zoom) !== JSON.stringify(scene.media?.zoom))
    throw new Error(`ズームが撮影時の位置・時刻と異なります。再編集してください: ${scene.id}`);
}
export function shotSubject(page: Page, shot: Shot) {
  const candidates = page.locator(shot.subject.selector);
  return shot.subject.text
    ? candidates.filter({ hasText: new RegExp(shot.subject.text) })
    : candidates;
}

// bboxだけでなく祖先のスクロール領域による欠けも調べる。
export async function measureSubject(subject: Locator) {
  return subject.evaluateAll((elements) => {
    const measured = elements.map((element) => {
      const box = element.getBoundingClientRect();
      let left = 0,
        top = 0,
        right = innerWidth,
        bottom = innerHeight;
      let shown = getComputedStyle(element).visibility === "visible";
      for (let node: Element | null = element; node; node = node.parentElement) {
        const style = getComputedStyle(node),
          bounds = node.getBoundingClientRect();
        if (style.display === "none" || Number(style.opacity) === 0) shown = false;
        if (node === element) continue;
        if (/auto|scroll|hidden|clip/.test(style.overflowX)) {
          left = Math.max(left, bounds.left);
          right = Math.min(right, bounds.right);
        }
        if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
          top = Math.max(top, bounds.top);
          bottom = Math.min(bottom, bounds.bottom);
        }
      }
      return {
        x: box.x / innerWidth,
        y: box.y / innerHeight,
        width: box.width / innerWidth,
        height: box.height / innerHeight,
        visible:
          shown &&
          box.width > 0 &&
          box.height > 0 &&
          box.left >= left - 1 &&
          box.top >= top - 1 &&
          box.right <= right + 1 &&
          box.bottom <= bottom + 1,
        text: element instanceof HTMLElement ? element.innerText : (element.textContent ?? ""),
      };
    });
    const x = Math.min(...measured.map((box) => box.x));
    const y = Math.min(...measured.map((box) => box.y));
    return {
      x,
      y,
      width: Math.max(...measured.map((box) => box.x + box.width)) - x,
      height: Math.max(...measured.map((box) => box.y + box.height)) - y,
      visible: measured.length > 0 && measured.every((box) => box.visible),
      text: measured.map((box) => box.text).join("\n"),
    };
  });
}
export function subjectMatches(shot: Shot, measured: Awaited<ReturnType<typeof measureSubject>>) {
  return (
    measured.visible &&
    shot.subject.required.every((pattern) => new RegExp(pattern).test(measured.text))
  );
}
export async function captureShot(
  page: Page,
  sceneId: string,
  shot: Shot,
  out: string,
  waitForState?: (state: string) => Promise<void>,
): Promise<ShotEvidence> {
  if (shot.state) {
    if (!waitForState) throw new Error(`アプリの状態待ちが未指定です: ${shot.state}`);
    await waitForState(shot.state);
  }
  for (const step of shot.steps)
    await page.getByRole(step.role, { name: new RegExp(step.name) }).click();
  const target = shotSubject(page, shot);
  await target.first().waitFor({ state: "visible", timeout: 45000 });
  await target.first().scrollIntoViewIfNeeded();
  await target.last().scrollIntoViewIfNeeded();
  const deadline = Date.now() + 45000;
  let stableSince = Date.now(),
    previous = "";
  while (true) {
    const measured = await measureSubject(target);
    const signature = JSON.stringify(measured);
    if (!subjectMatches(shot, measured) || signature !== previous) stableSince = Date.now();
    previous = signature;
    if (Date.now() - stableSince >= 600) break;
    if (Date.now() > deadline)
      throw new Error(`撮影条件を満たしていません（未表示・文言不足・画面外）: ${sceneId}`);
    await page.waitForTimeout(100);
  }
  const readyAt = Date.now();
  const measured = await measureSubject(target);
  // マウスは情報を隠さない位置へ退避する。実UIの内容やスタイルは変更しない。
  await page.mouse.move(8, 8, { steps: 10 });
  const image = `tablecast-shot-${sceneId}.png`;
  await page.screenshot({ path: resolve(out, image) });
  while (Date.now() - readyAt < shot.hold * 1000) {
    const current = await measureSubject(target);
    if (
      !subjectMatches(shot, current) ||
      Math.abs(current.x - measured.x) > 0.003 ||
      Math.abs(current.y - measured.y) > 0.003 ||
      Math.abs(current.width - measured.width) > 0.003 ||
      Math.abs(current.height - measured.height) > 0.003
    )
      throw new Error(`撮影中に対象が移動・欠落しました: ${sceneId}`);
    await page.waitForTimeout(150);
  }
  const evidence = {
    sceneId,
    definition: shotHash(shot),
    readyAt,
    endAt: Date.now(),
    target: {
      label: shot.intent,
      x: measured.x,
      y: measured.y,
      width: measured.width,
      height: measured.height,
    },
    text: measured.text,
    image,
  };
  await writeFile(
    resolve(out, `tablecast-shot-${sceneId}.json`),
    JSON.stringify(evidence, null, 2),
  );
  return evidence;
}
