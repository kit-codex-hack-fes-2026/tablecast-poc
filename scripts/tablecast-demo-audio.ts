import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { z } from "zod";
import dialogue from "../docs/demo/dialogue.json";
import voiceAssignments from "../docs/demo/voices.json";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    generate: { type: "boolean", default: false },
    verify: { type: "boolean", default: false },
    only: { type: "string" },
  },
});
const root = resolve(import.meta.dir, "..");
const output = resolve(root, "assets/demo/audio");
const manifestPath = resolve(output, "manifest.json");
const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const speakers = new Map(Object.entries(dialogue.speakers));
const voices = new Map(Object.entries(voiceAssignments.voices));
if (values.generate || values.verify) {
  execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
  execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
}
const downloadSchema = z.object({
  requestSha256: z.string(),
  audioContent: z.string().min(1),
  generatedAt: z.string(),
  processedCharacters: z.number().nullable(),
});
const receiptSchema = z.object({
  requestSha256: z.string(),
  audioSha256: z.string(),
  generatedAt: z.string(),
  durationSeconds: z.number().positive(),
  sampleRateHertz: z.number(),
  channels: z.number(),
  processedCharacters: z.number().nullable(),
  voiceId: z.string().optional(),
  language: z.string().optional(),
  instruction: z.string().optional(),
  overlap: z
    .object({ sourceFiles: z.array(z.string()).length(2), offsetMs: z.number() })
    .optional(),
});
const receipts = z
  .record(z.string(), receiptSchema)
  .parse(
    (await Bun.file(manifestPath).exists()) ? (await Bun.file(manifestPath).json()).files : {},
  );
const jobs = [
  ...dialogue.scenarios.flatMap((scenario) =>
    scenario.turns.map((turn) => ({ ...turn, file: `${scenario.id}/${turn.id}.mp3` })),
  ),
  ...dialogue.staffExamples.map((turn) => ({ ...turn, file: `reference/${turn.id}.mp3` })),
];
if (values.only && !jobs.some((job) => job.id === values.only))
  throw new Error("--onlyにはdialogue.jsonに存在する発話IDを指定してください。");

function probe(path: string) {
  const result = z
    .object({
      format: z.object({ duration: z.coerce.number().positive() }),
      streams: z.tuple([
        z.object({ sample_rate: z.coerce.number().positive(), channels: z.number().positive() }),
      ]),
    })
    .parse(
      JSON.parse(
        execFileSync(
          "ffprobe",
          [
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=sample_rate,channels",
            "-of",
            "json",
            path,
          ],
          { encoding: "utf8" },
        ),
      ),
    );
  return {
    durationSeconds: result.format.duration,
    sampleRateHertz: result.streams[0].sample_rate,
    channels: result.streams[0].channels,
  };
}

async function saveManifest() {
  await mkdir(output, { recursive: true });
  await writeFile(
    `${manifestPath}.tmp`,
    `${JSON.stringify(
      {
        provider: "Inworld",
        model: "inworld-tts-2",
        script: "docs/demo/dialogue.json",
        voices: "docs/demo/voices.json",
        evaluationStatus: "paid_e2e_not_run",
        files: receipts,
      },
      null,
      2,
    )}\n`,
  );
  await rename(`${manifestPath}.tmp`, manifestPath);
}

let generated = 0;
let reused = 0;
for (const job of jobs.filter((item) => !values.only || item.id === values.only)) {
  const speaker = speakers.get(job.speaker);
  const voice = voices.get(job.speaker);
  if (!speaker || !voice) throw new Error(`話者またはvoice設定がありません: ${job.speaker}`);
  const request = {
    text: job.text,
    voiceId: voice.voiceId,
    modelId: "inworld-tts-2",
    language: voice.language,
    instruction: voice.instruction,
    deliveryMode: "STABLE",
    audioConfig: {
      audioEncoding: "MP3",
      sampleRateHertz: 48000,
      bitRate: 128000,
      speakingRate: voice.speakingRate,
    },
  };
  const requestSha256 = sha256(JSON.stringify(request));
  const path = resolve(output, job.file);
  const downloadPath = `${path}.download.json`;
  const receipt = receipts[job.file];
  if (
    receipt?.requestSha256 === requestSha256 &&
    (await Bun.file(path).exists()) &&
    sha256(await readFile(path)) === receipt.audioSha256
  ) {
    reused += 1;
    if (values.verify) probe(path);
    if (values.generate && (await Bun.file(downloadPath).exists())) {
      const saved = downloadSchema.parse(await Bun.file(downloadPath).json());
      if (saved.requestSha256 === requestSha256) await rm(downloadPath);
    }
    continue;
  }
  if (values.verify)
    throw new Error(`音声が未生成または台本・声・音声SHAと不一致です: ${job.file}`);
  if (!values.generate) {
    console.log(
      `生成予定: ${job.file} · ${speaker.name} · ${voice.voiceId} · ${job.text.length}文字`,
    );
    continue;
  }
  let download: z.infer<typeof downloadSchema>;
  if (await Bun.file(downloadPath).exists()) {
    download = downloadSchema.parse(await Bun.file(downloadPath).json());
    if (download.requestSha256 !== requestSha256)
      throw new Error(`取得済み音声の台本が異なります。生成前に確認してください: ${downloadPath}`);
  } else {
    if (
      (await Bun.file(path).exists()) &&
      (!receipt || sha256(await readFile(path)) !== receipt.audioSha256)
    )
      throw new Error(
        `生成記録と一致しない音声があります。再課金の前に確認してください: ${job.file}`,
      );
    if (!process.env.INWORLD_API_KEY)
      throw new Error("INWORLD_API_KEYを標準env-file経由で設定してください。");
    // 音声素材の作成専用HTTP。製品のRealtime接続や業務ツールを複製しない。
    const response = await fetch("https://api.inworld.ai/tts/v1/voice", {
      method: "POST",
      headers: {
        Authorization: `Basic ${process.env.INWORLD_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(90000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(
        `Inworld合成失敗: HTTP ${response.status} (${job.id})。自動再試行は行いません。`,
      );
    }
    const result = z
      .object({
        audioContent: z.string().min(1),
        usage: z.object({ processedCharactersCount: z.number() }).optional(),
      })
      .parse(await response.json());
    await mkdir(dirname(path), { recursive: true });
    download = {
      requestSha256,
      audioContent: result.audioContent,
      generatedAt: new Date().toISOString(),
      processedCharacters: result.usage?.processedCharactersCount ?? null,
    };
    // 取得後の検査で止まっても、同じ有料合成を呼ばず保存済みレスポンスから再開する。
    await writeFile(downloadPath, JSON.stringify(download));
  }
  const bytes = Uint8Array.fromBase64(download.audioContent);
  await writeFile(path, bytes);
  receipts[job.file] = receiptSchema.parse({
    requestSha256,
    audioSha256: sha256(bytes),
    generatedAt: download.generatedAt,
    processedCharacters: download.processedCharacters,
    ...probe(path),
    voiceId: request.voiceId,
    language: request.language,
    instruction: request.instruction,
  });
  await saveManifest();
  await rm(downloadPath);
  generated += 1;
  console.log(`生成済み: ${job.file}`);
}

if (!values.only && (values.generate || values.verify)) {
  for (const scenario of dialogue.scenarios) {
    for (const [index, turn] of scenario.turns.entries()) {
      if (turn.cue.type !== "overlap_previous") continue;
      const previous = scenario.turns[index - 1];
      if (!previous || !("offsetMs" in turn.cue) || typeof turn.cue.offsetMs !== "number")
        throw new Error(`重なりの開始指定が不正です: ${turn.id}`);
      const a = `${scenario.id}/${previous.id}.mp3`;
      const b = `${scenario.id}/${turn.id}.mp3`;
      const offsetMs = turn.cue.offsetMs;
      if (
        !receipts[a] ||
        !receipts[b] ||
        offsetMs < 0 ||
        offsetMs >= receipts[a].durationSeconds * 1000
      )
        throw new Error(`直前発話の途中に重なりません: ${turn.id}`);
      const file = `overlap/${scenario.id}-${turn.id}.wav`;
      const path = resolve(output, file);
      const filter = `[1:a]adelay=${offsetMs}:all=1[b];[0:a][b]amix=inputs=2:normalize=0,alimiter=limit=0.95`;
      const requestSha256 = sha256(
        JSON.stringify({
          a: receipts[a].audioSha256,
          b: receipts[b].audioSha256,
          offsetMs,
          filter,
          sampleRateHertz: 48000,
          channels: 1,
        }),
      );
      if (
        receipts[file]?.requestSha256 === requestSha256 &&
        (await Bun.file(path).exists()) &&
        sha256(await readFile(path)) === receipts[file].audioSha256
      ) {
        if (values.verify) probe(path);
        continue;
      }
      if (values.verify) throw new Error(`重なり音声が未生成または不一致です: ${file}`);
      if (
        (await Bun.file(path).exists()) &&
        (!receipts[file] || sha256(await readFile(path)) !== receipts[file].audioSha256)
      )
        throw new Error(`生成記録と一致しない重なり音声があります: ${file}`);
      await mkdir(dirname(path), { recursive: true });
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-y",
        "-i",
        resolve(output, a),
        "-i",
        resolve(output, b),
        "-filter_complex",
        filter,
        "-ar",
        "48000",
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
        path,
      ]);
      receipts[file] = receiptSchema.parse({
        requestSha256,
        audioSha256: sha256(await readFile(path)),
        generatedAt: new Date().toISOString(),
        processedCharacters: null,
        overlap: { sourceFiles: [a, b], offsetMs },
        ...probe(path),
      });
      await saveManifest();
    }
  }
}
console.log(
  JSON.stringify({
    generated,
    reused,
    mode: values.verify ? "verify" : values.generate ? "generate" : "plan",
  }),
);
