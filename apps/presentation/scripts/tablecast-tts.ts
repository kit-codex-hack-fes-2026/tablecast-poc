import { constants } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { parseEnv, parseArgs } from "node:util";
import { z } from "zod";
import {
  readAudioDuration,
  audioPath,
  readProject,
  root,
  speechRequest,
  speechHash,
  type Project,
  type SpeechCue,
  needsVoice,
  selectScenes,
} from "./tablecast-project";

export async function requestSpeech(project: Project, item: SpeechCue, apiKey: string) {
  const response = await fetch("https://api.inworld.ai/tts/v1/voice", {
    method: "POST",
    headers: { Authorization: `Basic ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(speechRequest(project, item)),
    signal: AbortSignal.timeout(90_000),
  }).catch(() => {
    throw new Error("Inworldへの接続が失敗しました。自動再試行はしません");
  });
  if (!response.ok) throw new Error(`Inworld HTTP ${response.status}。自動再試行はしません`);
  const body: unknown = await response.json().catch(() => {
    throw new Error("Inworldの音声応答形式が不正です");
  });
  const result = z
    .object({
      audioContent: z
        .string()
        .min(1)
        .regex(/^[A-Za-z0-9+/]+={0,2}$/),
    })
    .safeParse(body);
  if (!result.success) throw new Error("Inworldの音声応答形式が不正です");
  return Buffer.from(result.data.audioContent, "base64");
}

// 課金する入口を通常のbuild・testから分離する。キー・応答本文は出力しない。
export async function generateAudio(args: string[] = []) {
  const source = await readProject();
  const { values } = parseArgs({ args, options: { film: { type: "string" } } });
  const film = values.film ? source.films?.[values.film] : undefined;
  if (values.film && !film) throw new Error("指定した動画がありません");
  const project = selectScenes(source, film?.scenes.join(","));
  const envPath = process.env.TABLECAST_PRESENTATION_ENV_FILE;
  const env = envPath ? parseEnv(await readFile(envPath, "utf8")) : process.env;
  const apiKey = env.INWORLD_API_KEY;
  if (!apiKey) throw new Error("INWORLD_API_KEY または TABLECAST_PRESENTATION_ENV_FILE が必要です");
  await mkdir(resolve(root, "assets/audio"), { recursive: true });
  const lock = resolve(root, "assets/audio/.tablecast-tts.lock");
  await mkdir(lock).catch(() => {
    throw new Error(
      "音声生成のロックを取得できません。同時実行、前回の中断、書込権限を確認してください",
    );
  });
  try {
    for (const item of project.scenes.flatMap((scene) =>
      scene.cues.filter((part) => needsVoice(scene, part)),
    )) {
      const path = resolve(root, audioPath(project, item));
      const exists = await stat(path).then(
        () => true,
        (error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
          return false;
        },
      );
      if (exists) {
        await readAudioDuration(path);
        console.info(`${item.id}: 保存済み音声を再利用`);
        continue;
      }
      const cache = (await readdir(resolve(root, "assets/audio")))
        .sort()
        .find((name) => name.endsWith(`-${speechHash(project, item)}.wav`));
      if (cache) {
        const cachedPath = resolve(root, "assets/audio", cache);
        await readAudioDuration(cachedPath);
        await copyFile(cachedPath, path, constants.COPYFILE_EXCL);
        console.info(`${item.id}: 同じ生成条件の保存済み音声を再利用`);
        continue;
      }
      const audio = await requestSpeech(project, item, apiKey);
      // 検証失敗・書込中断でも課金済み音声を残し、次回はキャッシュ検証で停止する。
      await writeFile(path, audio, { flag: "wx" });
      const duration = await readAudioDuration(path);
      console.info(`${item.id}: Inworld音声 ${duration.toFixed(2)}秒`);
    }
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}
if (import.meta.main)
  generateAudio(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "音声生成に失敗しました");
    process.exitCode = 1;
  });
