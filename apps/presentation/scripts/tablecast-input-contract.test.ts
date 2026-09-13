import { expect, test } from "vitest";
import current from "../projects/tablecast-main-rerecord.json";
import sample from "../sample.json";
import booking from "../examples/tablecast-booking/project.json";
import mutation from "../experiments/tablecast-mutation/project.json";
import { projectSchema, timeline, type Project } from "./tablecast-project";

const project = projectSchema.parse(current);
function scene(id: string) {
  const found = project.scenes.find((item) => item.id === id);
  if (!found) throw new Error(`場面が必要です: ${id}`);
  return structuredClone(found);
}
const parse = (item: Project["scenes"][number]) =>
  projectSchema.parse({ ...project, films: undefined, scenes: [item] });

test.each([current, sample, booking, mutation])("既存台本と別題材の入力互換性を保つ", (input) => {
  expect(projectSchema.safeParse(input).success).toBe(true);
});

test("タイトル画像1枚は表示可能な入力として許可する", () => {
  expect(() => parse(scene("opening"))).not.toThrow();
});
test.each([2, 3])("タイトル画像%d枚を黙って捨てず拒否する", (count) => {
  const item = scene("opening");
  item.images = Array.from({ length: count }, (_, index) => `assets/images/title-${index}.png`);
  expect(() => parse(item)).toThrow("導入の静止画は1枚");
});

const variants = {
  technical: { technical: scene("tech-intro").technical },
  diagram: {
    diagram: {
      columns: Array.from({ length: 4 }, (_, n) => ({
        title: `列${n}`,
        nodes: [{ id: `node-${n}`, label: "要素", detail: "説明", meta: "出典" }],
      })),
      links: [],
      focus: [{ cue: "input-cue", offset: 0, targets: ["node-0"], title: "注目" }],
      note: "模式図",
    },
  },
  sourceTree: { sourceTree: [{ path: "README.md", detail: "説明", depth: 0 }] },
  images: { images: ["assets/images/title.png"] },
  media: { media: scene("staff").media },
};
const names = ["technical", "diagram", "sourceTree", "images", "media"] as const;
test.each(names.flatMap((a, i) => names.slice(i + 1).map((b) => [a, b] as const)))(
  "%sと%sの同時指定を優先順位で黙って捨てない",
  (a, b) => {
    const result = projectSchema.safeParse({
      ...project,
      films: undefined,
      scenes: [
        {
          ...scene("opening"),
          images: undefined,
          ...variants[a],
          ...variants[b],
        },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.message.includes("重ねて指定"))).toBe(true);
  },
);

test("実録の説明欠落、図に隠れる説明、適用されない強調・カメラを拒否する", () => {
  expect(() => parse({ ...scene("staff"), points: [] })).toThrow("操作の説明");
  expect(() => parse({ ...scene("tech-intro"), points: ["表示されない説明"] })).toThrow("図の説明");
  expect(() => parse({ ...scene("opening"), pointFocus: [{ at: 0, point: 0 }] })).toThrow(
    "説明の強調",
  );
  expect(() =>
    parse({ ...scene("opening"), camera: [{ at: 0, x: 0.5, y: 0.5, zoom: 2 }] }),
  ).toThrow("カメラ移動");
});

test("まとめは全画像の表示予定と結論へ移る前の表示時間を確保する", () => {
  const item = scene("closing");
  item.pointFocus = [{ at: 0, point: 0 }];
  expect(() => parse(item)).toThrow("すべて表示");
  item.pointFocus = undefined;
  const input = parse(item);
  const durations = Object.fromEntries(item.cues.map((cue) => [cue.id, 0.5]));
  item.duration = 4;
  expect(() => timeline({ ...input, scenes: [item] }, durations, {})).toThrow("結論へ切り替える尺");
  item.duration = 6;
  expect(() => timeline({ ...input, scenes: [item] }, durations, {})).not.toThrow();
});
