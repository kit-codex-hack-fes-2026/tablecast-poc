import { escapeHtml as h, type Project, type timeline } from "./tablecast-project";

type Timing = ReturnType<typeof timeline>;

// 接続の端点は実DOMから取得する。列間の余白で曲げ、文字を横切らせない。
export function diagramLink(fromId: string, toId: string, boardId: string) {
  const from = document.getElementById(fromId)?.getBoundingClientRect();
  const to = document.getElementById(toId)?.getBoundingClientRect();
  const board = document.getElementById(boardId)?.getBoundingClientRect();
  if (!from || !to || !board) throw new Error("図の接続先がありません");
  if (Math.abs(from.left - to.left) < 1) {
    const x = from.left + from.width / 2 - board.left;
    const down = to.top > from.top;
    return `M ${x} ${(down ? from.bottom : from.top) - board.top} L ${x} ${(down ? to.top : to.bottom) - board.top}`;
  }
  const rightward = from.left < to.left;
  const x1 = (rightward ? from.right : from.left) - board.left,
    x2 = (rightward ? to.left : to.right) - board.left;
  const y1 = from.top + from.height / 2 - board.top;
  const y2 = to.top + to.height / 2 - board.top;
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`;
}

export function diagramMarkup(scene: Timing["scenes"][number], prefix: string) {
  const diagram = scene.diagram;
  if (!diagram) throw new Error(`技術図がありません: ${scene.id}`);
  const animations: string[] = [];
  const columns = diagram.columns
    .map(
      (column, index) =>
        `<div class="diagram-column"><h2>${h(column.title)}</h2>${column.nodes
          .map(
            (node) =>
              `<article id="${prefix}-node-${node.id}" class="diagram-node tone-${index}"><h3>${h(node.label)}</h3><p>${h(node.detail)}</p><p class="diagram-meta">${h(node.meta)}</p><svg class="diagram-ring" viewBox="0 0 400 180" preserveAspectRatio="none" aria-hidden="true"><rect x="4" y="4" width="392" height="172" rx="24" pathLength="1"/></svg><svg class="diagram-pointer" viewBox="0 0 28 32" aria-hidden="true"><path d="M3 2 L3 25 L10 19 L16 30 L21 27 L15 17 L25 16 Z"/></svg></article>`,
          )
          .join("")}</div>`,
    )
    .join("");
  const links = diagram.links
    .map((link, index) => {
      animations.push(
        `tl.set("#${prefix}-link-${index}", { attr: { d: () => diagramLink("${prefix}-node-${link.from}", "${prefix}-node-${link.to}", "${prefix}-board") } }, 0);`,
      );
      return `<path id="${prefix}-link-${index}" marker-end="url(#${prefix}-arrow)" ${link.both ? `marker-start="url(#${prefix}-arrow)"` : ""}/>`;
    })
    .join("");
  diagram.focus.forEach((focus, index) => {
    const cue = scene.cues.find((part) => part.id === focus.cue);
    if (!cue) throw new Error(`図に対応する発話がありません: ${focus.cue}`);
    const start = scene.start + cue.at + focus.offset;
    const next = diagram.focus[index + 1];
    const end = next
      ? scene.start + (scene.cues.find((part) => part.id === next.cue)?.at ?? 0) + next.offset
      : scene.start + scene.duration;
    animations.push(
      `tl.set("#${prefix} .diagram-ring, #${prefix} .diagram-pointer, #${prefix} .diagram-focus", { autoAlpha: 0 }, ${start});`,
      `tl.set("#${prefix} .diagram-node", { backgroundColor: "#ffffff" }, ${start});`,
      `tl.set("#${prefix}-focus-${index}", { autoAlpha: 1 }, ${start});`,
    );
    if (index > 0)
      animations.push(
        `tl.set("#${prefix} .diagram-ring rect", { strokeDashoffset: 1 }, ${start});`,
      );
    for (const target of focus.targets) {
      const selector = `#${prefix}-node-${target}`;
      animations.push(
        `tl.set("${selector}", { backgroundColor: "#fff4df" }, ${start});`,
        `tl.set("${selector} .diagram-ring, ${selector} .diagram-pointer", { autoAlpha: 1 }, ${start});`,
        `tl.fromTo("${selector} rect", { strokeDashoffset: 1 }, { strokeDashoffset: 0, autoRound: false, duration: ${Math.min(0.28, end - start)}, ease: "power1.out", immediateRender: false }, ${start});`,
      );
    }
  });
  const captions = diagram.focus
    .map(
      (focus, index) =>
        `<p id="${prefix}-focus-${index}" class="diagram-focus"><b>いまの説明 ${String(index + 1).padStart(2, "0")}</b>${h(focus.title)}</p>`,
    )
    .join("");
  return {
    html: `<div class="diagram-body"><div id="${prefix}-board" class="diagram-board"><svg class="diagram-links" width="1792" height="580" aria-hidden="true"><defs><marker id="${prefix}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9"/></marker></defs>${links}</svg>${columns}</div><div class="diagram-guide">${captions}</div><p class="diagram-note">${h(diagram.note)}</p></div>`,
    animations,
  };
}

// HyperFrames標準のclip相対volume automation。実会話は場面全体を保守的にduckする。
export function musicEnvelope(
  timing: Timing,
  sound: NonNullable<Project["soundtrack"]>,
  start: number,
  duration: number,
) {
  const speech = [
    ...timing.cues
      .filter((cue) => cue.audioDuration > 0)
      .map((cue) => ({ start: cue.start, end: cue.start + cue.audioDuration })),
    ...timing.scenes
      .filter((scene) => scene.media?.audio)
      .map((scene) => ({ start: scene.start, end: scene.start + scene.duration })),
  ];
  const times = new Set([start, start + duration]);
  for (const time of [
    0.5,
    timing.duration - 0.7,
    ...speech.flatMap((item) => [item.start - 0.15, item.start, item.end, item.end + 0.4]),
  ])
    if (time > start && time < start + duration) times.add(time);
  const points = [...times]
    .sort((a, b) => a - b)
    .map((time) => {
      let volume = sound.musicVolume;
      for (const item of speech) {
        const gain =
          time < item.start
            ? (item.start - time) / 0.15
            : time > item.end
              ? (time - item.end) / 0.4
              : 0;
        volume = Math.min(
          volume,
          sound.speechVolume +
            Math.max(0, Math.min(1, gain)) * (sound.musicVolume - sound.speechVolume),
        );
      }
      volume *= Math.min(1, time / 0.5, (timing.duration - time) / 0.7);
      return { t: Math.round((time - start) * 1000) / 1000, v: Math.max(0, volume) };
    });
  return { version: 1, lanes: [{ target: "volume", points }] };
}
