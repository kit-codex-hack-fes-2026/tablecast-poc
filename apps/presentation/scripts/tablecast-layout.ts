import type { gsap } from "gsap";

declare global {
  interface Window {
    __timelines: Record<string, gsap.core.Timeline>;
  }
}

// Playwrightのpage.evaluateへ渡し、生成物の実DOM・フォント・GSAP状態を検査する。
// HyperFramesの汎用検査では判断できない、字幕帯と説明領域の契約を補う。
export function inspectLayout({ sceneId, time }: { sceneId: string; time: number }) {
  const scene = document.getElementById(`scene-${sceneId}`);
  if (!scene) throw new Error(`場面がありません: ${sceneId}`);
  const timeline = window["__timelines"].tablecast;
  if (!timeline) throw new Error("描画タイムラインがありません");
  timeline.seek(time);
  const issues: string[] = [];
  const visible = (node: Element) => {
    for (let current: Element | null = node; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) < 0.01)
        return false;
    }
    return true;
  };
  const inside = (
    box: { left: number; top: number; right: number; bottom: number },
    bounds: { left: number; top: number; right: number; bottom: number },
  ) =>
    box.left >= bounds.left - 2 &&
    box.right <= bounds.right + 2 &&
    box.top >= bounds.top - 2 &&
    box.bottom <= bounds.bottom + 2;
  const label = (node: Element) => node.id || `${node.tagName}.${node.className}`;
  const contentBounds = { left: 64, right: 1856, top: 152, bottom: 902 };
  const check = (node: Element, bounds: typeof contentBounds) => {
    if (!visible(node)) return;
    if (!inside(node.getBoundingClientRect(), bounds)) issues.push(`${label(node)}: 領域外`);
  };
  for (const node of scene.querySelectorAll(
    ".tech-body, .tech-panel, .tech-summary, .demo-aside, .opening-copy, .opening-title, .editorial-body, .source-body, .diagram-body, .diagram-column, .diagram-node, .diagram-guide, .diagram-focus, .diagram-note, .music-credit, .recap-copy, .recap-shot img, .end-signature",
  ))
    check(node, contentBounds);
  for (const node of scene.querySelectorAll(".diagram-node, .tech-panel")) {
    const bounds = node.getBoundingClientRect();
    for (const text of node.querySelectorAll("h3, p, pre, img")) check(text, bounds);
  }
  const shell = document.querySelector(`#scene-${sceneId}-screen`);
  if (shell) check(shell, contentBounds);
  for (const frame of shell?.querySelectorAll(".device-frame, .device-base, .browser-chrome") ?? [])
    check(frame, contentBounds);
  const aside = scene.querySelector(".demo-aside, .opening-copy");
  if (shell && aside && visible(shell) && visible(aside)) {
    const a = shell.getBoundingClientRect();
    const b = aside.getBoundingClientRect();
    if (a.right > b.left - 24 && b.right > a.left - 24) issues.push("実画面と説明の間隔が24px未満");
  }
  for (const node of scene.querySelectorAll("header"))
    check(node, { left: 64, right: 1856, top: 24, bottom: 170 });
  for (const node of scene.querySelectorAll("footer"))
    check(node, { left: 64, right: 1856, top: 1040, bottom: 1080 });
  const captions = Array.from(document.querySelectorAll<HTMLElement>(".caption")).filter(
    (node) =>
      time >= Number(node.dataset.start) &&
      time < Number(node.dataset.start) + Number(node.dataset.duration),
  );
  for (const caption of captions) check(caption, { left: 64, right: 1856, top: 922, bottom: 1030 });
  for (const node of [...scene.querySelectorAll("h1, h2, h3, p, li, code, footer"), ...captions]) {
    if (!visible(node)) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    // Rangeは行ボックスより大きいフォントのem領域も返す。
    // その差だけを許容し、折り返した追加行のはみ出しとは区別する。
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let leading = 0;
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      const line = document.createRange();
      line.selectNodeContents(text);
      const height = Number.parseFloat(getComputedStyle(text.parentElement ?? node).lineHeight);
      for (const rect of line.getClientRects()) {
        if (Number.isFinite(height)) leading = Math.max(leading, rect.height - height);
      }
    }
    const box = node.getBoundingClientRect();
    if (
      !inside(range.getBoundingClientRect(), {
        left: box.left,
        right: box.right,
        top: box.top - leading,
        bottom: box.bottom + leading,
      })
    )
      issues.push(`${label(node)}: 文字が表示枠からはみ出す`);
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      const inset = style.clipPath.match(/^inset\((.*)\)$/)?.[1];
      const completedMask =
        inset !== undefined && (inset.match(/[\d.]+/g) ?? []).every((v) => Number(v) === 0);
      if (
        (style.overflow === "hidden" || style.overflow === "clip" || completedMask) &&
        !inside(box, parent.getBoundingClientRect())
      ) {
        issues.push(`${label(node)}: ${label(parent)}の切り抜きで欠ける`);
      }
    }
  }
  return { sceneId, time, issues };
}
