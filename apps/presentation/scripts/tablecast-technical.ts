import { escapeHtml as h, type timeline } from "./tablecast-project";

export function technicalMarkup(
  scene: ReturnType<typeof timeline>["scenes"][number],
  prefix: string,
) {
  const board = scene.technical;
  if (!board) throw new Error("技術図がありません");
  const panels = board.panels
    .map(
      (
        p,
      ) => `<article id="${prefix}-tech-${p.id}" class="tech-panel tech-${p.style} tech-${p.tone}" style="left:${p.x}px;top:${p.y}px;width:${p.width}px;height:${p.height}px">
    <h3>${p.icon ? `<img id="${prefix}-${p.id}-logo" data-start="${scene.start}" data-duration="${scene.duration}" class="tech-logo" src="${h(p.icon)}" alt="">` : ""}<span>${h(p.label)}</span></h3>${p.image ? `<img id="${prefix}-${p.id}-image" data-start="${scene.start}" data-duration="${scene.duration}" class="tech-screenshot" src="${h(p.image)}" alt="${h(p.label)}">` : ""}${p.detail ? (p.style === "code" ? `<pre><code>${h(p.detail)}</code></pre>` : `<p class="tech-detail">${h(p.detail).replaceAll("\n", "<br>")}</p>`) : ""}${p.meta ? `<p class="tech-meta">${h(p.meta)}</p>` : ""}<span class="tech-outline" aria-hidden="true"></span></article>`,
    )
    .join("");
  const connections = board.connections
    .map(
      (
        c,
      ) => `<g id="${prefix}-tech-${c.id}" class="tech-connection${c.response ? " tech-response" : ""}" data-from="${prefix}-tech-${c.from}" data-to="${prefix}-tech-${c.to}">
    <path d="${c.points.map(([x, y], i) => `${i ? "L" : "M"} ${x} ${y}`).join(" ")}" pathLength="1" marker-end="url(#${prefix}-tip)"/><text x="${c.labelAt[0]}" y="${c.labelAt[1]}" text-anchor="middle">${h(c.label)}</text><path class="tech-trace" d="${c.points.map(([x, y], i) => `${i ? "L" : "M"} ${x} ${y}`).join(" ")}" pathLength="1" marker-end="url(#${prefix}-active-tip)"/></g>`,
    )
    .join("");
  const lifelines = (board.lifelines ?? [])
    .map((x) => `<path class="tech-lifeline" d="M ${x} 94 L ${x} 650"/>`)
    .join("");
  const animations: string[] = [];
  const focuses = board.focus.map((f) => {
    const cue = scene.cues.find((c) => c.id === f.cue);
    if (!cue) throw new Error(`技術図の発話がありません: ${f.cue}`);
    return { ...f, at: scene.start + cue.at + f.offset };
  });
  focuses.forEach((f, index) => {
    const at = f.at;
    const interval = (focuses[index + 1]?.at ?? scene.start + scene.duration) - at;
    // 最初の非表示はCSSが所有する。後続の注目先へ移る時だけ前の強調を消す。
    if (index > 0)
      animations.push(
        `tl.set("#${prefix} .tech-outline, #${prefix} .tech-summary", {autoAlpha:0}, ${at});`,
      );
    if (board.connections.length) {
      animations.push(`tl.set("#${prefix} .tech-connection", {color:"#536674"}, ${at});`);
      if (index > 0)
        animations.push(
          `tl.set("#${prefix} .tech-trace", {autoAlpha:0,strokeDashoffset:1}, ${at});`,
        );
    }
    animations.push(`tl.set("#${prefix}-summary-${index}", {autoAlpha:1}, ${at});`);
    for (const target of f.targets) {
      const selector = `#${prefix}-tech-${target}`;
      if (board.connections.some((c) => c.id === target)) {
        animations.push(
          `tl.set("${selector}", {color:"#087d79"}, ${at});`,
          `tl.set("${selector} .tech-trace", {autoAlpha:1}, ${at});`,
          `tl.fromTo("${selector} .tech-trace", {strokeDashoffset:1}, {strokeDashoffset:0,autoRound:false,duration:${Math.min(0.65, interval)},ease:"power2.inOut",immediateRender:false}, ${at});`,
        );
      } else {
        animations.push(
          `tl.fromTo("${selector} .tech-outline", {autoAlpha:0}, {autoAlpha:1,duration:${Math.min(0.2, interval)},immediateRender:false}, ${at});`,
        );
      }
    }
  });
  return {
    html: `<div class="tech-body tech-view-${board.view}"><p class="tech-legend">${h(board.legend)}</p><div class="tech-board"><svg class="tech-svg" viewBox="0 0 1792 660" aria-label="${h(scene.title)}の接続図"><defs><marker id="${prefix}-tip" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto"><path d="M1 1 L11 6 L1 11" fill="none" stroke="#536674" stroke-width="2"/></marker><marker id="${prefix}-active-tip" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path d="M1 1 L11 6 L1 11" fill="none" stroke="#087d79" stroke-width="2"/></marker></defs>${lifelines}${connections}</svg>${panels}</div><div class="tech-summary-band">${board.focus.map((f, i) => `<p id="${prefix}-summary-${i}" class="tech-summary"><b>FOCUS</b>${h(f.summary)}</p>`).join("")}</div></div>`,
    animations,
  };
}
