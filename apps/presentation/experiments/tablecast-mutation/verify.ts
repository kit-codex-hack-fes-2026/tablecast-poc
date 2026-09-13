import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve, relative } from "node:path";
import { z } from "zod";
const root = resolve(import.meta.dirname, "../..");
const repo = resolve(root, "../..");
const variant = resolve(repo, "../tablecast-mutation-test");
const read = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(resolve(root, path), "utf8"));
const sha = async (path: string) =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
const baseline = z
  .object({
    applicationRevision: z.string(),
    files: z.array(z.object({ file: z.string(), sha256: z.string() })),
  })
  .parse(await read("records/tablecast-mutation-baseline.json"));
for (const item of baseline.files)
  if ((await sha(resolve(root, item.file))) !== item.sha256)
    throw Error("基盤に変更: " + item.file);
const preservation = await read("experiments/tablecast-mutation/preservation.json");
const runs = [];
const reportSchema = z.object({
  status: z.string(),
  project: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
  duration: z.number(),
  videoHash: z.string(),
  inputHashes: z.record(z.string(), z.string()),
  playback: z.object({ ended: z.boolean(), error: z.unknown() }),
  steps: z.array(z.object({ name: z.string(), status: z.string(), log: z.string() })),
  frames: z.array(z.unknown()),
  metadata: z.unknown(),
  layout: z.unknown(),
  peakDb: z.number(),
  captureCoverage: z.unknown(),
  editorialReview: z.string(),
});
for (const name of ["tablecast-mutation-product-v2", "tablecast-mutation-technical-v1"]) {
  const report = reportSchema.parse(await read(`output/${name}/report.json`));
  if (
    report.status !== "rendered-and-checked" ||
    !report.playback.ended ||
    report.playback.error ||
    report.steps.some((s) => s.status !== "passed")
  )
    throw Error("未完了: " + name);
  if ((await sha(resolve(root, `output/${name}/video.mp4`))) !== report.videoHash)
    throw Error("動画ハッシュ不一致");
  if ((await sha(report.project)) !== report.inputHashes[report.project])
    throw Error("生成後の台本変更");
  runs.push({
    name,
    report: `output/${name}/report.json`,
    video: `output/${name}/video.mp4`,
    project: relative(root, report.project).replaceAll("\\", "/"),
    status: report.status,
    startedAt: report.startedAt,
    finishedAt: report.finishedAt,
    duration: report.duration,
    metadata: report.metadata,
    videoHash: report.videoHash,
    layout: report.layout,
    peakDb: report.peakDb,
    frames: report.frames.length,
    playback: report.playback,
    captureCoverage: report.captureCoverage,
    steps: report.steps,
    editorialReview: report.editorialReview,
  });
}
const apiDiff = execFileSync("git", ["diff", "--", "apps/api"], {
  cwd: variant,
  encoding: "utf8",
  windowsHide: true,
});
if (apiDiff) throw Error("APIの変更は今回の検証対象としていません");
const changedFiles = execFileSync("git", ["diff", "--name-only"], {
  cwd: variant,
  encoding: "utf8",
  windowsHide: true,
})
  .trim()
  .split(/\r?\n/);
const modifiedSource = [];
for (const file of changedFiles)
  modifiedSource.push({ file, sha256: await sha(resolve(variant, file)) });
const record = {
  date: "2026-09-13",
  issue: 1,
  conclusion:
    "大幅なUI・導線変更に対し、共通基盤を変更せず題材側の変更で2本の動画生成・再生検査が完了",
  scope:
    "同一の実API・データモデルを使うTableCastのUI改変。別業務・別APIへの移植や映像品質の承認は含まない。",
  application: {
    baseRevision: baseline.applicationRevision,
    checkout: variant,
    patch: "experiments/tablecast-mutation/application.patch",
    patchHash: await sha(resolve(import.meta.dirname, "application.patch")),
    modifiedSource,
    apiUnchanged: true,
    origin: "http://mutation.tablecast-poc.container.localhost:3100",
    composeProject: "tablecast-mutation",
    isolatedDatabase: true,
  },
  fixedFoundation: {
    count: baseline.files.length,
    unchanged: true,
    baseline: "records/tablecast-mutation-baseline.json",
  },
  allowedAdaptations: [
    "台本・字幕・カット・画像",
    "撮影定義のタブ名",
    "題材専用adapterの操作名・GUI手順・分割発話への完了待ち",
  ],
  captures: {
    guest: "tablecast-mutation-guest-v4",
    staff: "tablecast-mutation-staff-v1",
    admin: "tablecast-mutation-admin-v1",
    freshMediaScenes: 13,
    formalShotEvidenceScenes: 8,
    table: "T12",
    sessionId: "60f01c7d-6b07-4354-8ea0-26e52364e3b2",
    orders: 1,
    cartLines: 0,
    newNarrationRequests: 0,
  },
  checks: {
    applicationLint: "passed",
    applicationTypecheck: "passed",
    relatedApplicationUnitTests: 2,
    adapterTypecheck: "passed",
    preservation,
  },
  rejectedAttempts: [
    {
      take: "tablecast-mutation-guest-v1",
      reason: "新規合成店舗で音声未選択。正規の設定APIで解消。",
    },
    {
      take: "tablecast-mutation-guest-v2",
      reason: "GUI照合後の音声が読み上げを行わず、confirmation-readの状態検査が停止。",
    },
    {
      take: "tablecast-mutation-guest-v3",
      reason:
        "注文は送信されたが、分割発話の最初のターンだけを待ち不採用。専用adapterで最後のターンを待つよう修正。",
    },
    {
      run: "tablecast-mutation-product-v1",
      reason: "素材末尾を約0.009秒超える台本を検出。台本の開始位置をフレーム境界へ調整。",
    },
  ],
  nonBlockingWarnings: [
    {
      run: "tablecast-mutation-product-v2",
      code: "composition_file_too_large",
      detail:
        "生成HTMLが489行。HyperFrames lintはエラー0・警告1。保守性の分割推奨であり、固定試験中は生成器を変更しない。",
    },
  ],
  runs,
  cleanup:
    "専用Composeの2コンテナは停止。DB・独立clone・生成素材を保持。元のidleコンテナと既存動画は維持。",
  editorialReview: "pending-user",
  commitAndPush: "not-performed",
};
await writeFile(
  resolve(root, "records/tablecast-mutation-validation.json"),
  JSON.stringify(record, null, 2) + "\n",
);
console.log("共通基盤35件の不変・2本の完了・保全結果を検証記録へ保存しました");
