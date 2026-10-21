import { diagramMarkup } from "../tablecast-composition.ts";
import {
  cameraTransitionDuration,
  devices,
  escapeHtml as h,
  type Project,
  recapFocus,
  recapHandoffDuration,
  roles,
  type timeline,
} from "../tablecast-project.ts";
import { technicalMarkup } from "../tablecast-technical.ts";
export const clip = (id: string, start: number, duration: number, track: number, css: string) =>
  `id="${id}" class="clip ${css}" data-start="${start}" data-duration="${duration}" data-track-index="${track}"`;
export function sceneMarkup({
  project,
  timing,
  videoSizes,
  imageSizes,
}: {
  imageSizes: Map<string, { height: number; width: number }>;
  project: Project;
  timing: ReturnType<typeof timeline>;
  videoSizes: Map<string, { height: number; width: number }>;
}) {
  const brand = project.brand ?? { name: "Demo", title: "製品デモ" };
  const roleNames = project.brand?.roles ?? roles;

  // 外枠・PCのウィンドウ上端と台座も含め、本文領域内に収める。
  const screenLayout = (size: { height: number; width: number }, device?: string) => {
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
        content = `<div class="source-body"><div class="source-tree"><p class="source-heading">${h(scene.sourceHeading ?? "REPOSITORY")}</p>${scene.sourceTree
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
        const focus = recapFocus(scene);
        const handoff = scene.duration - recapHandoffDuration;
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
        const nextSize = next?.media && videoSizes.get(next.media.file);
        const continuous =
          nextSize && Math.abs(size.width / size.height - nextSize.width / nextSize.height) < 0.003;
        const device = continuous ? next?.device : undefined;
        content = `<div class="opening-layout"><div class="opening-copy"><h2 class="opening-title">${(scene.titleLines ?? [scene.title]).map((line) => `<span>${h(line)}</span>`).join("")}</h2><p class="opening-description">${h(scene.kicker)}</p><ol class="opening-points">${points.join("")}</ol></div><div id="${prefix}-screen" class="opening-screen ${device ? `framed-${device}` : ""}" style="width:${width}px;height:${height}px;left:${initial.x}px;top:${initial.y}px">${frameMarkup(device)}<img src="${h(image)}" alt="${h(brand.name)}の実アプリ画面"></div></div>`;
        if (continuous) {
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
      if (scene.sourceTree)
        scene.points.forEach((_, pointIndex) => {
          const start = scene.start + (scene.duration * pointIndex) / scene.points.length;
          const end = scene.start + (scene.duration * (pointIndex + 1)) / scene.points.length;
          animations.push(
            `tl.set("#${prefix}-point-${pointIndex}", { backgroundColor: "#e8edf8", borderColor: "#647dcc" }, ${start});`,
            `tl.set("#${prefix}-point-${pointIndex}", { backgroundColor: "transparent", borderColor: "#d9dce1" }, ${end});`,
          );
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
  return { sceneHtml, mediaHtml, animations };
}
