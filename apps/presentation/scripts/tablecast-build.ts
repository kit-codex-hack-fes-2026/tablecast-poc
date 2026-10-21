import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { z } from "zod";
import { clip, sceneMarkup } from "./tablecast-build/scenes.ts";
import { diagramLink, musicEnvelope } from "./tablecast-composition.ts";
import {
  audioPath,
  devices,
  escapeText,
  escapeHtml as h,
  imageDimensions,
  mediaInfo,
  needsVoice,
  readAudioDuration,
  readProject,
  requireLocalMedia,
  root,
  selectScenes,
  speakers,
  timeline,
} from "./tablecast-project.ts";
import { verifyShotEdit } from "./tablecast-shot.ts";
import { resolveSource } from "./tablecast-source.ts";

try {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: { scenes: { type: "string" }, film: { type: "string" }, out: { type: "string" } },
  });
  const source = await readProject();
  const film = values.film ? source.films?.[values.film] : undefined;
  if (values.film && !film) throw new Error("指定した動画がありません");
  if (source.films && !film && !values.scenes)
    throw new Error("--film または --scenes を指定してください");
  if (values.scenes && !values.out) throw new Error("場面の試写には --out を指定してください");
  const project = selectScenes(selectScenes(source, film?.scenes.join(",")), values.scenes);
  const brand = project.brand ?? { name: "Demo", title: "製品デモ" };
  const speakerNames = project.brand?.speakers ?? speakers;
  const durations: Record<string, number> = {};
  const mediaDurations: Record<string, number> = {};
  const recordedAudio = new Map<string, number>();
  const videoSizes = new Map<string, { height: number; width: number }>();
  const imageSizes = new Map<string, { height: number; width: number }>();
  const files = new Set(["assets/fonts/NotoSansJP-VF.ttf", "assets/fonts/LICENSE"]);
  for (const scene of project.scenes) {
    for (const path of scene.technical?.sources ?? []) await resolveSource(path);
    for (const panel of scene.technical?.panels ?? []) {
      if (panel.icon) {
        await access(resolve(root, panel.icon));
        files.add(panel.icon);
      }
      if (panel.image) {
        await access(resolve(root, panel.image));
        files.add(panel.image);
      }
    }
    for (const entry of scene.sourceTree ?? []) await resolveSource(entry.path);
    for (const image of scene.images ?? []) {
      files.add(image);
      if (!imageSizes.has(image))
        imageSizes.set(image, await imageDimensions(resolve(root, image)));
    }
    for (const item of scene.cues.filter((part) => needsVoice(scene, part))) {
      const file = audioPath(project, item);
      durations[item.id] = await readAudioDuration(resolve(root, file));
      files.add(file);
    }
    if (scene.media && !videoSizes.has(scene.media.file)) {
      const footage = await mediaInfo(resolve(root, scene.media.file));
      const video = footage.streams.find((stream) => stream.codec_type === "video");
      if (!video?.width || !video.height)
        throw new Error(`実録映像にはvideo streamが必要です: ${scene.media.file}`);
      mediaDurations[scene.media.file] = video.duration ?? footage.format.duration;
      videoSizes.set(scene.media.file, { width: video.width, height: video.height });
      const audio = footage.streams.find((stream) => stream.codec_type === "audio");
      if (audio?.duration) recordedAudio.set(scene.media.file, audio.duration);
      files.add(scene.media.file);
    }
    if (scene.media && scene.device) {
      const video = videoSizes.get(scene.media.file);
      if (!video) throw new Error(`素材の解像度を確認できません: ${scene.media.file}`);
      const device = devices[scene.device];
      if (Math.abs(video.width / video.height / (device.width / device.height) - 1) > 0.003)
        throw new Error(
          `素材の比率と端末が異なります: ${scene.id} (${video.width}×${video.height})`,
        );
    }
    if (scene.media?.project) {
      // projectを生成HTMLへ埋め込まない。編集用ファイルの存在を検査する。
      await access(resolve(root, scene.media.project));
    }
    if (scene.capture && scene.media) {
      if (!scene.media.shot) throw new Error(`撮影定義に対応する収録証跡がありません: ${scene.id}`);
      const events = z
        .object({ captureStartedAtMs: z.number() })
        .parse(
          JSON.parse(
            await readFile(
              resolve(root, dirname(scene.media.shot), "tablecast-events.json"),
              "utf8",
            ),
          ),
        );
      const take = z
        .object({ status: z.literal("accepted"), scenes: z.array(z.string()) })
        .parse(
          JSON.parse(
            await readFile(resolve(root, dirname(scene.media.shot), "tablecast-take.json"), "utf8"),
          ),
        );
      if (!take.scenes.includes(scene.id))
        throw new Error(`採用可能な撮影ではありません: ${scene.id}`);
      verifyShotEdit(
        scene,
        JSON.parse(await readFile(resolve(root, scene.media.shot), "utf8")),
        events.captureStartedAtMs,
      );
      if (dirname(scene.media.shot) !== dirname(scene.media.project ?? ""))
        throw new Error(`撮影証跡と編集projectの保存先が違います: ${scene.id}`);
    }
    if (scene.media?.audio && !recordedAudio.has(scene.media.file))
      throw new Error(`実会話の音声streamの尺を確認できません: ${scene.media.file}`);
    if (
      scene.media?.audio &&
      scene.media.offset + scene.media.duration >
        (recordedAudio.get(scene.media.file) ?? 0) + 0.000001
    )
      throw new Error(`実会話の音声の範囲を超えています: ${scene.id}`);
  }
  const timing = timeline(project, durations, mediaDurations);
  if (
    film?.duration &&
    !values.scenes &&
    Math.abs(timing.duration - film.duration) > 1 / project.fps / 2
  )
    throw new Error(`動画の尺が指定と異なります: ${timing.duration} / ${film.duration}`);
  let musicDuration = 0;
  let effectDuration = 0;
  if (project.soundtrack) {
    musicDuration = await readAudioDuration(resolve(root, project.soundtrack.music));
    effectDuration = await readAudioDuration(resolve(root, project.soundtrack.effect));
    files.add(project.soundtrack.music);
    files.add(project.soundtrack.effect);
  }
  if (values.out && !/^dist\/[a-z0-9-]+$/.test(values.out))
    throw new Error("--out は dist/名前 の形式で指定してください");
  if (values.out && source.films?.[values.out.slice(5)])
    throw new Error("試写の出力先に完成動画のディレクトリは指定できません");
  const output = resolve(root, values.out ?? (values.film ? `dist/${values.film}` : "dist"));
  await mkdir(output, { recursive: true });
  for (const file of files) {
    await mkdir(dirname(resolve(output, file)), { recursive: true });
    await requireLocalMedia(resolve(root, file));
    await copyFile(resolve(root, file), resolve(output, file));
  }
  await copyFile(
    fileURLToPath(import.meta.resolve("gsap/dist/gsap.min.js")),
    resolve(output, "gsap.min.js"),
  );
  await copyFile(resolve(root, "styles.css"), resolve(output, "styles.css"));
  const { sceneHtml, mediaHtml, animations } = sceneMarkup({
    project,
    timing,
    videoSizes,
    imageSizes,
  });
  const soundtrackHtml: string[] = [];
  if (project.soundtrack) {
    for (let start = 0, index = 0; start < timing.duration; start += musicDuration, index++) {
      const duration = Math.min(musicDuration, timing.duration - start);
      const automation = musicEnvelope(timing, project.soundtrack, start, duration);
      soundtrackHtml.push(
        `<audio ${clip(`music-${index}`, start, duration, 5, "music")} src="${project.soundtrack.music}" data-volume="${project.soundtrack.musicVolume}" data-automation="${h(JSON.stringify(automation))}" preload="auto"></audio>`,
      );
    }
    let previousChapter: string | undefined;
    for (const scene of timing.scenes) {
      if (scene.chapter === previousChapter) continue;
      previousChapter = scene.chapter;
      soundtrackHtml.push(
        `<audio ${clip(`effect-${scene.id}`, scene.start, Math.min(effectDuration, scene.duration), 6, "effect")} src="${project.soundtrack.effect}" data-volume="${project.soundtrack.effectVolume}" preload="auto"></audio>`,
      );
    }
  }
  const html = `<!doctype html>
<html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=${project.width}, height=${project.height}">
<title>${h(brand.title)}</title><link rel="stylesheet" href="styles.css"><script src="gsap.min.js"></script></head>
<body><main id="root" data-composition-id="tablecast" data-start="0" data-duration="${timing.duration}" data-width="${project.width}" data-height="${project.height}" data-fps="${project.fps}">
${sceneHtml}
${mediaHtml.join("\n")}
${soundtrackHtml.join("\n")}
<nav class="progress" aria-label="全編の進行">${timing.scenes.map((scene) => `<div style="flex-grow:${scene.duration}"><span id="progress-${scene.id}"></span></div>`).join("")}</nav>
${timing.cues
  .map(
    (
      item,
    ) => `<p ${clip(`caption-${item.id}`, item.start, item.duration, 3, `caption speaker-${item.speaker}`)}><b class="speaker-name">${h(speakerNames[item.speaker])}<small>${{ narrator: "動画の説明", customer: "質問・依頼", cast: "AIの応答", instruction: "画面の状態" }[item.speaker]}</small></b><span class="caption-text">${h(item.text)}</span></p>
${item.audioDuration > 0 ? `<audio ${clip(`voice-${item.id}`, item.start, item.audioDuration, 4, "voice")} src="${audioPath(project, item)}" preload="auto"></audio>` : ""}`,
  )
  .join("\n")}
</main><script>
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
function stepLayout(selector) {
  const row = document.querySelector(selector);
  if (!row) throw new Error("手順の配置先がありません: " + selector);
  return { y: row.offsetTop, height: row.offsetHeight - 8 };
}
${diagramLink.toString()}
${animations.join("\n")}
window.__timelines.tablecast = tl;
// フォント確定前の行寸法をGSAPの初期値として残さない。
document.fonts.ready.then(() => tl.invalidate().seek(tl.time()));
</script></body></html>`;
  await writeFile(resolve(output, "index.html"), html);
  // 派生物は編集しない。実音声尺と単一台本から毎回作り直す。
  await writeFile(resolve(output, "timing.json"), JSON.stringify(timing, null, 2));
  const timestamp = (seconds: number) =>
    new Date(Math.round(seconds * 1000)).toISOString().slice(11, 23);
  await writeFile(
    resolve(output, "captions.vtt"),
    `WEBVTT\n\n${timing.cues.map((item) => `${timestamp(item.start)} --> ${timestamp(item.start + item.duration)}\n<v ${escapeText(speakerNames[item.speaker])}>${escapeText(item.text)}</v>\n`).join("\n")}`,
  );
  console.info(
    `TableCast: ${timing.duration.toFixed(2)}秒 / ${project.width}×${project.height} / ${timing.scenes.length}場面 / 字幕${timing.cues.length}件 / ナレーション${timing.cues.filter((item) => item.audioDuration > 0).length}本`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "動画構成の生成に失敗しました");
  process.exitCode = 1;
}
