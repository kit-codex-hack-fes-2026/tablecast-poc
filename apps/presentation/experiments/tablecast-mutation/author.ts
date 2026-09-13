import { readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { projectSchema, type Project } from "../../scripts/tablecast-project.ts";
const root = resolve(import.meta.dirname, "../..");
const read = async (file: string): Promise<unknown> =>
  JSON.parse(await readFile(resolve(root, file), "utf8"));
const path = "experiments/tablecast-mutation/project.json";
const p = projectSchema.parse(await read(path));
if (p.scenes.some((s) => s.id === "gui-review")) throw Error("採用後の台本は再初期化しません");
const take = "assets/openscreen/tablecast-mutation-guest-v4";
const events = z
  .object({
    captureStartedAtMs: z.number(),
    audioStartedAt: z.number(),
    shots: z.array(z.object({ sceneId: z.string() })),
    result: z.object({ tableName: z.string() }),
  })
  .parse(await read(take + "/tablecast-events.json"));
const acceptedTake = z.object({ status: z.literal("accepted") });
acceptedTake.parse(await read(take + "/tablecast-take.json"));
for (const role of ["staff", "admin"])
  acceptedTake.parse(
    await read(`assets/openscreen/tablecast-mutation-${role}-v1/tablecast-take.json`),
  );
const shift = (events.captureStartedAtMs - events.audioStartedAt) / 1000;
const plan = z
  .object({
    scenes: z.array(
      z.object({ id: z.string(), capture: projectSchema.shape.scenes.element.shape.capture }),
    ),
  })
  .parse(await read(take + "/tablecast-capture-plan.json"));
// 採用テイクの実発話、無音区間、状態保持から決めた音声時計上の切り出し。
const cuts: Record<string, [number, number]> = {
  roles: [shift + 0.1, 4.6],
  consult: [9.8, 4],
  "consult-answer": [22.65, 11.95],
  "voice-order": [35.15, 5.7],
  "order-added": [46.9, 12.4],
  pause: [65.2, 6.767],
  readback: [84.45, 13.65],
  approval: [99, 8.9],
  "approval-result": [113.55, 12.95],
  english: [142.55, 7.9],
};
const cue = (
  id: string,
  at: number,
  text: string,
  speaker: Project["scenes"][number]["cues"][number]["speaker"] = "cast",
) => ({ id, at, text, speaker, voice: false });
const cues: Record<string, ReturnType<typeof cue>[]> = {
  consult: [cue("consult-question", 0, "このお店の日本酒、月凪はどんな味ですか？", "customer")],
  "consult-answer": [
    cue("consult-taste", 0, "こもれび つきなぎ 純米吟醸は、"),
    cue("consult-aroma", 3.2, "青りんごを思わせる香りがあって、後口が軽いタイプです。"),
    cue("consult-finish", 8, "すっきり飲みやすい印象の日本酒ですね。"),
  ],
  "voice-order": [
    cue("voice-order-request", 0, "では、月凪を冷酒で90mlのグラスを一つお願いします。", "customer"),
  ],
  "order-added": [
    cue("voice-order-added", 0, "指定した内容が、ご注文リストに入りました。", "instruction"),
    cue("voice-order-name", 1.85, "こもれび つきなぎ 純米吟醸を、"),
    cue("voice-order-size", 4.5, "冷酒のグラス90mlで1つカートに入れました。"),
    cue("voice-order-price", 9.65, "お会計は780円です。"),
  ],
  readback: [
    cue("readback-product", 0, "こもれび つきなぎ 純米吟醸、冷酒、グラス90mlを1点、780円。"),
    cue("readback-total", 7.7, "合計780円です。"),
    cue("readback-ask", 10.1, "この内容で注文を送信してよろしいですか。"),
  ],
  approval: [
    cue("approval-yes", 0, "読み上げを確認してから、声で承認します。", "instruction"),
    cue("approval-spoken", 5.15, "はい、その内容で注文してください。", "customer"),
  ],
  "approval-result": [
    cue("approval-done", 0, "ご注文を送信しました。"),
    cue("approval-wait", 2.95, "お席でそのままお待ちください。"),
    cue("approval-history", 8.7, "お届け状況に、送信した注文が表示されます。", "instruction"),
  ],
  english: [
    cue("english-aroma", 0, "青りんごを思わせる香りに、"),
    cue("english-finish", 2.6, "軽く、すっきりした後口。"),
    cue("english-feel", 4.7, "全体に爽やかで、飲みやすい印象です。"),
  ],
};
const focus: Record<string, number[]> = {
  consult: [0, 1.4, 2.8],
  "consult-answer": [0, 3.2, 8],
  "voice-order": [0, 2, 4],
  "order-added": [0, 4.5, 9.65],
  pause: [0, 1.5, 4],
  readback: [0, 7.7, 10.1],
  approval: [0, 3.5, 5.15],
  "approval-result": [0, 3, 8.7],
  english: [0, 2.6, 4.7],
};
for (const s of p.scenes) {
  const cut = cuts[s.id];
  if (cut) {
    const [start, duration] = cut;
    s.media = {
      ...s.media,
      file: "assets/demo/tablecast-mutation-guest-v4.mp4",
      project: take + "/tablecast-edit.openscreen",
      offset: Number((start - shift).toFixed(3)),
      duration,
    };
    const sceneCues = cues[s.id];
    if (sceneCues) s.cues = sceneCues;
    const shot = events.shots.find((x) => x.sceneId === s.id);
    if (shot) {
      const planned = plan.scenes.find((x) => x.id === s.id);
      if (!planned?.capture) throw Error("撮影定義がありません: " + s.id);
      s.capture = planned.capture;
      s.media.shot = take + "/tablecast-shot-" + s.id + ".json";
    } else {
      delete s.capture;
      delete s.media.shot;
    }
    if (s.media.zoom?.mode === "detail") delete s.media.zoom.continueFrom;
    const sceneFocus = focus[s.id];
    if (sceneFocus)
      s.pointFocus = sceneFocus.slice(0, s.points.length).map((at, point) => ({ at, point }));
  }
  if (s.id === "pause" && s.media)
    s.media.zoom = {
      mode: "overview",
      reason: "移動した音声ボタンと注文リストを同時に見せ、停止中の画面操作へつなぐ。",
    };
  if (s.id === "approval-result" && s.media)
    s.media.zoom = {
      mode: "overview",
      reason: "送信の実応答から、下部ナビゲーションで同じ注文を表示するまでの流れを見せる。",
    };
  if (s.media) s.note = "UI変更テスト版の実収録 ／ 合成店舗・合成入力音声 ／ 専用DB・実API";
  if (s.id === "staff") {
    s.points = s.points.map((t) => t.replaceAll("T01", events.result.tableName));
    s.note = "同じ卓・同じ注文IDを新しい受付画面で処理。専用DB・390×844 viewportの実収録。";
  }
  if (s.id === "tech-intro")
    s.note = "UI変更テスト版の実録 ／ main 7d6adc7＋application.patch ／ 合成入力・実API";
  if (s.points) s.points = s.points.map((t) => t.replaceAll("注文履歴", "お届け状況"));
}
const pauseScene = p.scenes.find((s) => s.id === "pause");
if (!pauseScene) throw Error("停止場面がありません");
const gui: Project["scenes"][number] = {
  ...structuredClone(pauseScene),
  id: "gui-review",
  chapter: "画面でも確認",
  title: "新しい導線でも、確認してから注文",
  titleLines: ["新しい導線でも、", "確認してから注文"],
  kicker: "注文リストを開き直す",
  points: ["メニューから注文リストへ", "確認の操作は、その次に"],
  pointFocus: [
    { at: 0, point: 0 },
    { at: 2, point: 1 },
  ],
  cues: [
    cue("gui-review-open", 0, "商品を選ぶ → リストを開いて確認へ", "instruction"),
    cue("gui-review-safe", 2, "表示だけでは注文を送信しません。", "instruction"),
  ],
  media: {
    file: "assets/demo/tablecast-mutation-guest-v4.mp4",
    project: take + "/tablecast-edit.openscreen",
    offset: Number((71.967 - shift).toFixed(3)),
    duration: 4.133,
    audio: false,
    zoom: { mode: "overview", reason: "新しい下部ナビゲーションと確認ボタンの位置を見せる。" },
  },
};
delete gui.capture;
p.scenes.push(gui);
if (!p.films?.product) throw Error("商品紹介の定義がありません");
p.films.product.scenes.splice(p.films.product.scenes.indexOf("pause") + 1, 0, "gui-review");
const images: Record<string, [string, string]> = {
  "assets/images/tablecast-main-guest.png": [
    "assets/images/tablecast-mutation-guest.png",
    take + "/tablecast-overview.png",
  ],
  "assets/images/tablecast-main-consult.png": [
    "assets/images/tablecast-mutation-consult.png",
    take + "/tablecast-shot-consult-answer.png",
  ],
  "assets/images/tablecast-main-confirm.png": [
    "assets/images/tablecast-mutation-confirm.png",
    take + "/tablecast-shot-approval.png",
  ],
  "assets/images/tablecast-main-staff.png": [
    "assets/images/tablecast-mutation-staff.png",
    "assets/openscreen/tablecast-mutation-staff-v1/tablecast-after.png",
  ],
  "assets/images/tablecast-main-admin.png": [
    "assets/images/tablecast-mutation-admin.png",
    "assets/openscreen/tablecast-mutation-admin-v1/tablecast-after.png",
  ],
};
for (const [target, source] of Object.values(images))
  await copyFile(resolve(root, source), resolve(root, target));
for (const s of p.scenes) {
  if (s.images) s.images = s.images.map((imagePath) => images[imagePath]?.[0] ?? imagePath);
  if (s.technical)
    for (const panel of s.technical.panels) {
      const replacement = panel.image && images[panel.image];
      if (replacement) panel.image = replacement[0];
    }
}
await writeFile(resolve(root, path), JSON.stringify(p, null, 2) + "\n");
await writeFile(
  resolve(import.meta.dirname, "edit-decisions.json"),
  JSON.stringify(
    {
      take,
      audioOffset: shift,
      cuts,
      guiReview: { start: 71.967, duration: 4.133 },
      narration: "既存6本を再利用。実会話は今回の音声。",
      newTtsRequests: 0,
    },
    null,
    2,
  ) + "\n",
);
console.log("採用テイクと実発話から台本・字幕・画像を保存。共通の編集処理へ渡します。");
