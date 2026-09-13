import { access, copyFile, mkdir, writeFile, readFile } from "node:fs/promises";
import { verifyShotEdit } from "./tablecast-shot";
import { z } from "zod";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  audioPath,
  cameraTransitionDuration,
  readAudioDuration,
  requireLocalMedia,
  escapeHtml as h,
  escapeText,
  mediaInfo,
  imageDimensions,
  readProject,
  root,
  timeline,
  devices,
  roles,
  speakers,
  needsVoice,
  selectScenes,
} from "./tablecast-project";
import { diagramLink, diagramMarkup, musicEnvelope } from "./tablecast-composition";
import { technicalMarkup } from "./tablecast-technical";

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
  const brand = project.brand ?? { name: "TableCast", title: "TableCast — 声で相談、そのまま注文" };
  const roleNames = project.brand?.roles ?? roles;
  const speakerNames = project.brand?.speakers ?? speakers;
  const durations: Record<string, number> = {};
  const mediaDurations: Record<string, number> = {};
  const recordedAudio = new Map<string, number>();
  const videoSizes = new Map<string, { width: number; height: number }>();
  const imageSizes = new Map<string, { width: number; height: number }>();
  const files = new Set(["assets/fonts/NotoSansJP-VF.ttf", "assets/fonts/LICENSE"]);
  for (const scene of project.scenes) {
    for (const path of scene.technical?.sources ?? []) await access(resolve(root, "../..", path));
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
    for (const entry of scene.sourceTree ?? []) await access(resolve(root, "../..", entry.path));
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
    if (scene.media && !files.has(scene.media.file)) {
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
  const clip = (id: string, start: number, duration: number, track: number, css: string) =>
    `id="${id}" class="clip ${css}" data-start="${start}" data-duration="${duration}" data-track-index="${track}"`;
  // 外枠・PCのウィンドウ上端と台座も含め、本文領域内に収める。
  const screenLayout = (size: { width: number; height: number }, device?: string) => {
    const width = Math.min(
      device === "macbook" ? 1000 : 1120,
      ((device === "macbook" ? 652 : 700) * size.width) / size.height,
    );
    const height = (width * size.height) / size.width;
    const left = (project.width - width - 80 - 584) / 2;
    return { width, height, left, top: 152 + (740 - height) / 2, aside: left + width + 80 };
  };
  const frameMarkup = (device?: string) =>
    device && device !== "window"
      ? `<div class="device-frame" aria-hidden="true"></div>${device === "macbook" ? `<div class="browser-chrome"><i></i><i></i><i></i><span>${h(brand.name)}</span></div><div class="device-base"></div>` : '<div class="device-camera" aria-hidden="true"></div>'}`
      : "";
  const animations: string[] = [];
  const mediaHtml: string[] = [];
  const sceneHtml = timing.scenes
    .map((scene, sceneIndex) => {
      const prefix = `scene-${scene.id}`;
      const heading = (scene.titleLines ?? [scene.title]).map((line) => h(line)).join("<br>");
      const points = scene.points.map(
        (point, pointIndex) =>
          `<li id="${prefix}-point-${pointIndex}">${scene.kind === "demo" ? `<span class="step-number">${String(pointIndex + 1).padStart(2, "0")}</span>` : scene.images ? "" : `<span class="point-number">${String(pointIndex + 1).padStart(2, "0")}</span>`}<span>${h(point)}</span></li>`,
      );
      let content: string;
      if (scene.technical) {
        const technical = technicalMarkup(scene, prefix);
        content = technical.html;
        animations.push(...technical.animations);
      } else if (scene.kind === "demo" && scene.media) {
        const size = videoSizes.get(scene.media.file);
        if (!size) throw new Error(`録画の寸法がありません: ${scene.media.file}`);
        const box = screenLayout(size, scene.device);
        const label = `${scene.role ? roleNames[scene.role] : "実アプリ"} / ${scene.device ? devices[scene.device].label : "ブラウザー"}`;
        content = `<div class="demo-body" style="left:${box.aside}px"><aside class="demo-aside"><p class="role-label">${h(label)}</p><h1>${heading}</h1><p class="demo-context">${h(scene.kicker)}</p><div class="demo-steps"><p class="steps-heading">操作の流れ</p><div class="steps-track"><div id="${prefix}-active-step" class="active-step"></div><ol class="demo-points">${points.join("")}</ol></div></div></aside></div>`;
        // 動画と時刻付きsectionを入れ子にしない。動画の再生時刻はruntimeだけが所有する。
        mediaHtml.push(
          `<div id="${prefix}-screen" class="recorded-screen framed-${scene.device ?? "window"}" style="width:${box.width}px;height:${box.height}px;left:${box.left}px;top:${box.top}px">${frameMarkup(scene.device)}<div class="video-stage"><div id="${prefix}-camera" class="video-camera" data-layout-allow-overflow><video ${clip(`${prefix}-video`, scene.start, scene.duration, 2, "demo-video")} src="${h(scene.media.file)}" data-media-start="${scene.media.offset}" ${scene.media.audio ? 'data-has-audio="true"' : 'muted data-volume="0"'} playsinline preload="auto" aria-label="${h(scene.title)}の実操作録画"></video></div></div></div>`,
        );
        // clipの入れ子を避け、録画の表示領域を同じscene時刻で切り替える。
        animations.push(
          `tl.set("#${prefix}-screen", { visibility: "hidden" }, 0);`,
          `tl.set("#${prefix}-screen", { visibility: "visible" }, ${scene.start});`,
          `tl.set("#${prefix}-screen", { visibility: "hidden" }, ${scene.start + scene.duration});`,
        );
        // 画面中央に注視点を置き、映像の外側が見えない範囲で親要素だけを動かす。
        const cameraState = (camera: (typeof scene.camera)[number]) => ({
          xPercent: Math.max(
            100 * (1 - camera.zoom),
            Math.min(0, 100 * (0.5 - camera.x * camera.zoom)),
          ),
          yPercent: Math.max(
            100 * (1 - camera.zoom),
            Math.min(0, 100 * (0.5 - camera.y * camera.zoom)),
          ),
          scale: camera.zoom,
          transformOrigin: "0 0",
        });
        scene.camera.forEach((camera, cameraIndex) => {
          const previous = scene.camera[cameraIndex - 1] ?? camera;
          const duration =
            cameraIndex === 0 ? 0 : Math.min(cameraTransitionDuration, camera.at - previous.at);
          animations.push(
            `tl.fromTo("#${prefix}-camera", ${JSON.stringify(cameraState(previous))}, { ...${JSON.stringify(cameraState(camera))}, duration: ${duration}, ease: "power2.inOut", immediateRender: ${cameraIndex === 0} }, ${scene.start + camera.at - duration});`,
          );
        });
      } else if (scene.diagram) {
        const diagram = diagramMarkup(scene, prefix);
        content = diagram.html;
        animations.push(...diagram.animations);
      } else if (scene.sourceTree) {
        content = `<div class="source-body"><div class="source-tree"><p class="source-heading">REPOSITORY / 実在する責務とファイル</p>${scene.sourceTree
          .map(
            (entry) =>
              `<div class="source-row" style="padding-left:${24 + entry.depth * 28}px"><code>${h(
                entry.path
                  .split("/")
                  .filter(Boolean)
                  .slice(entry.depth ? -1 : 0)
                  .join("/"),
              )}</code><span>${h(entry.detail)}</span></div>`,
          )
          .join(
            "",
          )}</div><div class="source-workflow"><p class="eyebrow">${h(scene.kicker)}</p><ol class="result-points">${points.join("")}</ol></div></div>`;
      } else if (scene.kind === "flow") {
        content = `<div class="editorial-body flow-body"><p class="eyebrow">${h(scene.kicker)}</p><div class="flow"><div class="flow-rail"><div id="${prefix}-rail" class="flow-rail-fill"></div></div><ol class="flow-points">${points.slice(0, 3).join("")}</ol></div>${points.length > 3 ? `<ol class="flow-branch">${points.slice(3).join("")}</ol>` : ""}</div>`;
        animations.push(
          `tl.fromTo("#${prefix}-rail", { scaleX: 0 }, { scaleX: 1, duration: ${Math.max(1, scene.duration - 2)}, ease: "none" }, ${scene.start + 0.8});`,
        );
      } else if (scene.images && scene.kind === "result") {
        content = `<div class="recap-body"><div id="${prefix}-recap" class="recap-layout"><div class="recap-copy"><p class="role-label">${h(scene.kicker)}</p><ol class="recap-points">${scene.points.map((point, index) => `<li id="${prefix}-label-${index}">${h(point)}</li>`).join("")}</ol></div><div class="recap-gallery">${scene.images.map((file, index) => `<figure id="${prefix}-shot-${index}" class="recap-shot"><img src="${h(file)}" alt="${h(scene.points[index] ?? "実録画面")}"></figure>`).join("")}</div></div><div id="${prefix}-signature" class="end-signature"><p class="end-wordmark">${h(brand.name)}</p><p class="end-line">${heading}</p></div></div>`;
        // 音声に沿って根拠を順に見せ、最後の名乗りでロゴへ渡す。
        const focus =
          scene.pointFocus ?? scene.images.map((_, point) => ({ at: point * 0.9, point }));
        const handoff = scene.duration - 2.35;
        focus.forEach(({ at, point }, index) => {
          animations.push(
            `tl.fromTo("#${prefix}-shot-${point}", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 }, ${scene.start + at});`,
            `tl.to("#${prefix}-label-${point}", { color: "#24457a", borderColor: "#365d96", duration: 0.2 }, ${scene.start + at});`,
          );
          const previous = focus[index - 1];
          if (previous)
            animations.push(
              `tl.to("#${prefix}-shot-${previous.point}", { autoAlpha: 0, duration: 0.2 }, ${scene.start + at});`,
              `tl.to("#${prefix}-label-${previous.point}", { color: "#626975", borderColor: "transparent", duration: 0.2 }, ${scene.start + at});`,
            );
        });
        animations.push(
          `tl.to("#${prefix}-recap", { autoAlpha: 0, duration: 0.3 }, ${scene.start + handoff});`,
          `tl.set("#${prefix}-recap", { autoAlpha: 0 }, ${scene.start + handoff + 0.3});`,
          `tl.fromTo("#${prefix}-signature", { autoAlpha: 0, scale: 0.96 }, { autoAlpha: 1, scale: 1, duration: 0.55, ease: "power2.out" }, ${scene.start + handoff + 0.18});`,
        );
      } else if (scene.images) {
        // 最初のフレームから読める表紙。移動前に文字を退け、実演の実寸へ接続する。
        const image = scene.images[0];
        if (!image) throw new Error(`導入画像がありません: ${scene.id}`);
        const size = imageSizes.get(image);
        if (!size) throw new Error(`画像の寸法がありません: ${image}`);
        const width = Math.min(884, (680 * size.width) / size.height);
        const height = (width * size.height) / size.width;
        const initial = { x: 940 + (884 - width) / 2, y: 174 + (680 - height) / 2 };
        const next = timing.scenes[sceneIndex + 1];
        const device = values.film === "product" ? next?.device : undefined;
        content = `<div class="opening-layout"><div class="opening-copy"><h2 class="opening-title">${(scene.titleLines ?? [scene.title]).map((line) => `<span>${h(line)}</span>`).join("")}</h2><p class="opening-description">${h(scene.kicker)}</p><ol class="opening-points">${points.join("")}</ol></div><div id="${prefix}-screen" class="opening-screen ${device ? `framed-${device}` : ""}" style="width:${width}px;height:${height}px;left:${initial.x}px;top:${initial.y}px">${frameMarkup(device)}<img src="${h(image)}" alt="${h(brand.name)}の実アプリ画面"></div></div>`;
        const nextSize = next?.media && videoSizes.get(next.media.file);
        if (
          nextSize &&
          Math.abs(size.width / size.height - nextSize.width / nextSize.height) < 0.003
        ) {
          const destination = screenLayout(nextSize, next?.device);
          animations.push(
            `tl.to("#${prefix} .opening-copy", { autoAlpha: 0, duration: 0.25 }, ${scene.start + scene.duration - 1.2});`,
            `tl.to("#${prefix}-screen", { x: ${destination.left - initial.x}, y: ${destination.top - initial.y}, scale: ${destination.width / width}, transformOrigin: "0 0", duration: 0.9, ease: "power2.inOut" }, ${scene.start + scene.duration - 0.9});`,
          );
        }
      } else {
        content = `<div class="editorial-body ${scene.kind}-body"><p class="eyebrow">${h(scene.kicker)}</p><h2 class="hero-title">${heading}</h2><ol class="${scene.kind}-points">${points.join("")}</ol></div>`;
        if (sceneIndex === timing.scenes.length - 1) {
          animations.push(
            `tl.fromTo("#${prefix} .hero-title", { clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)", duration: 0.5, ease: "power2.out" }, ${scene.start});`,
          );
          scene.points.forEach((_, index) =>
            animations.push(
              `tl.fromTo("#${prefix}-point-${index}", { opacity: 0 }, { opacity: 1, duration: 0.35 }, ${scene.start + 0.3 + index * 0.3});`,
            ),
          );
        }
      }
      (scene.diagram ? [] : scene.points).forEach((_, pointIndex) => {
        const pointAt =
          scene.kind === "demo"
            ? (scene.camera[pointIndex]?.at ?? (scene.duration * pointIndex) / scene.points.length)
            : (scene.duration * pointIndex) / scene.points.length;
        if (scene.sourceTree) {
          const start = scene.start + pointAt;
          const end = scene.start + (scene.duration * (pointIndex + 1)) / scene.points.length;
          animations.push(
            `tl.set("#${prefix}-point-${pointIndex}", { backgroundColor: "#e8edf8", borderColor: "#647dcc" }, ${start});`,
            `tl.set("#${prefix}-point-${pointIndex}", { backgroundColor: "transparent", borderColor: "#d9dce1" }, ${end});`,
          );
        }
      });
      const callouts = scene.kind === "demo" ? (scene.pointFocus ?? [{ at: 0, point: 0 }]) : [];
      if (callouts.length) {
        const previous = timing.scenes[sceneIndex - 1];
        const continuation =
          previous?.kind === "demo" &&
          previous.title === scene.title &&
          previous.points.join("|") === scene.points.join("|");
        const initialPoint = continuation
          ? (previous.pointFocus?.at(-1)?.point ?? 0)
          : (callouts[0]?.point ?? 0);
        animations.push(
          `tl.set("#${prefix}-active-step", { y: () => stepLayout("#${prefix}-point-${initialPoint}").y, height: () => stepLayout("#${prefix}-point-${initialPoint}").height }, 0);`,
        );
        if (!continuation) {
          animations.push(
            `tl.fromTo("#${prefix} .demo-aside", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" }, ${scene.start});`,
          );
        }
        callouts.forEach((focus) => {
          animations.push(
            `tl.to("#${prefix}-active-step", { y: () => stepLayout("#${prefix}-point-${focus.point}").y, height: () => stepLayout("#${prefix}-point-${focus.point}").height, duration: 0.4, ease: "power2.inOut" }, ${scene.start + focus.at});`,
          );
          scene.points.forEach((_, pointIndex) => {
            animations.push(
              `tl.to("#${prefix}-point-${pointIndex}", { color: "${pointIndex === focus.point ? "#24457a" : "#5c626c"}", duration: 0.3 }, ${scene.start + focus.at});`,
            );
            animations.push(
              `tl.set("#${prefix}-point-${pointIndex} .step-number", { backgroundColor: "${pointIndex === focus.point ? "#365d96" : "#e8ebef"}", color: "${pointIndex === focus.point ? "#ffffff" : "#515966"}" }, ${scene.start + focus.at});`,
            );
          });
        });
      }
      animations.push(
        `tl.fromTo("#progress-${scene.id}", { scaleX: 0 }, { scaleX: 1, duration: ${scene.duration}, ease: "none" }, ${scene.start});`,
      );
      return `<section ${clip(prefix, scene.start, scene.duration, 10 + sceneIndex, `scene scene-${scene.kind}${scene.technical ? " scene-technical" : ""}`)} aria-label="${h(scene.chapter)}">
<header><p class="chapter">${h(scene.chapter)}<span class="wordmark">${h(brand.name)}</span></p>${scene.kind === "flow" || scene.sourceTree || scene.technical ? `<h1>${heading}</h1>` : ""}</header>
<div id="${prefix}-content">${content}</div>${sceneIndex === timing.scenes.length - 1 && project.soundtrack?.credit ? `<p class="music-credit">${h(project.soundtrack.credit)}</p>` : ""}<footer>${h(scene.note)}</footer>
</section>`;
    })
    .join("\n");
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
