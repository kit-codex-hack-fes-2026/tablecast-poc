import type { Project } from "./tablecast-project";

type Media = NonNullable<Project["scenes"][number]["media"]>;
type Detail = Extract<NonNullable<Media["zoom"]>, { mode: "detail" }>;

// OpenScreen標準の遷移はstartMsより約1.023秒前に始まり、0.5秒後に着地する。
// 台本には見えている移動の開始を記述し、切り出しで助走を失わないよう変換する。
export const zoomMotion = { enter: 1.522575, lead: 1.022575, exit: 1.01505 };
const zoomScales = [1, 1.25, 1.5, 1.8, 2.2, 3.5, 5] as const;

// 情報のまとまりに画面寸法の4%ずつ余白を足し、その全体が収まる標準倍率を選ぶ。
export function fitZoom(target: Detail["target"]) {
  const bounds = {
    left: Math.max(0, target.x - 0.04),
    top: Math.max(0, target.y - 0.04),
    right: Math.min(1, target.x + target.width + 0.04),
    bottom: Math.min(1, target.y + target.height + 0.04),
  };
  // 導入版のCLIはv2 projectのcustomScaleを出力に反映しないため標準depthだけを使う。
  const available = Math.min(1 / (bounds.right - bounds.left), 1 / (bounds.bottom - bounds.top));
  const depth = zoomScales.findLastIndex((scale) => scale <= available);
  const scale = zoomScales[depth] ?? 1;
  const inset = 0.5 / scale;
  const inside = (value: number) => Math.max(inset, Math.min(1 - inset, value));
  return {
    scale,
    depth,
    x: inside((bounds.left + bounds.right) / 2),
    y: inside((bounds.top + bounds.bottom) / 2),
    bounds,
  };
}

// 台本の判断を標準OpenScreen projectへ反映。切り出し境界でも同じ確認対象を保つ。
export function zoomRegions(
  scenes: Project["scenes"],
  viewport: { x: number; y: number; width: number; height: number },
  sourceTrim = 0,
) {
  const regions: {
    id: string;
    startMs: number;
    endMs: number;
    depth: number;
    focus: { cx: number; cy: number };
    focusMode: "manual";
    source: "manual";
  }[] = [];
  const byScene = new Map<string, (typeof regions)[number]>();
  for (const scene of [...scenes].sort((a, b) => (a.media?.offset ?? 0) - (b.media?.offset ?? 0))) {
    const media = scene.media;
    const zoom = media?.zoom;
    if (!media || zoom?.mode !== "detail") continue;
    const cue = scene.cues.find((part) => part.id === zoom.cue);
    if (!cue) throw new Error(`ズームの発話がありません: ${zoom.cue}`);
    const fitted = fitZoom(zoom.target);
    // 「詳細」を指定したのに動きが消える状態を、等倍への暗黙の変更で隠さない。
    if (fitted.scale === 1)
      throw new Error(
        `ズーム対象が広すぎます。対象を分割するか全体表示を指定してください: ${scene.id}`,
      );
    const endMs = Math.round(
      (sourceTrim + media.offset + (zoom.exitAt ?? media.duration + 0.8)) * 1000,
    );
    if (zoom.continueFrom) {
      const previous = byScene.get(zoom.continueFrom);
      if (!previous) throw new Error(`継続するズームがありません: ${zoom.continueFrom}`);
      if (
        scenes.some(
          (item) =>
            item.media?.zoom?.mode === "overview" &&
            (sourceTrim + item.media.offset) * 1000 < endMs &&
            (sourceTrim + item.media.offset + item.media.duration) * 1000 > previous.startMs,
        )
      )
        throw new Error("継続ズームが全体表示の場面を横切ります");
      previous.endMs = endMs;
      byScene.set(scene.id, previous);
      continue;
    }
    const region = {
      id: `tablecast-${scene.id}`,
      startMs: Math.round(
        (sourceTrim + media.offset + cue.at + zoom.offset + zoomMotion.lead) * 1000,
      ),
      endMs,
      depth: fitted.depth,
      focus: {
        cx: (viewport.x + fitted.x * viewport.width) / 1920,
        cy: (viewport.y + fitted.y * viewport.height) / 1080,
      },
      focusMode: "manual" as const,
      source: "manual" as const,
    };
    regions.push(region);
    byScene.set(scene.id, region);
  }
  return regions;
}
