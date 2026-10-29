import { expect, it } from "vitest";
import { personFeatures, PersonTracker, type Point } from "./standby-geometry-model";
function person() {
  const pose: Point[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  const face: Point[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.25 }));
  for (const [index, x, y] of [
    [0, 0.5, 0.25],
    [11, 0.35, 0.6],
    [12, 0.65, 0.6],
    [15, 0.35, 0.4],
    [16, 0.65, 0.4],
  ])
    if (index !== undefined && x !== undefined && y !== undefined)
      pose[index] = { x, y, visibility: 1 };
  for (const [index, x] of [
    [234, 0.4],
    [454, 0.6],
    [33, 0.43],
    [133, 0.47],
    [468, 0.45],
    [362, 0.53],
    [263, 0.57],
    [473, 0.55],
  ])
    if (index !== undefined && x !== undefined) face[index] = { x, y: 0.25 };
  for (const index of [159, 386]) face[index] = { x: 0.5, y: 0.23 };
  for (const index of [145, 374]) face[index] = { x: 0.5, y: 0.27 };
  return { pose, face };
}
function hand(x: number, tip: Point, base: Point) {
  const points: Point[] = Array.from({ length: 21 }, () => ({ x, y: 0.4 }));
  points[5] = base;
  points[8] = tip;
  points[6] = { x, y: 0.32 };
  for (const index of [10, 14, 18]) points[index] = { x, y: 0.3 };
  for (const index of [12, 16, 20]) points[index] = { x, y: 0.39 };
  return points;
}
it("別人物の手や低品質の特徴点を挙手に合成せず、同じ人物の交差だけを認める", () => {
  const { pose, face } = person();
  const left = hand(0.35, { x: 0.6, y: 0.1 }, { x: 0.4, y: 0.3 });
  const right = hand(0.65, { x: 0.4, y: 0.1 }, { x: 0.6, y: 0.3 });
  expect(personFeatures(pose, face, [left, right], 0.95)).toMatchObject({
    raised: true,
    crossed: true,
  });
  expect(personFeatures(pose, face, [], 0.95)).toMatchObject({ raised: false, crossed: false });
  expect(personFeatures(pose, face, [left, left], 0.95)).toMatchObject({
    raised: false,
    crossed: false,
  });
  expect(personFeatures(pose, face, [left, right], 0.3)).toBeUndefined();
  expect(personFeatures([], face, [left, right], 0.95)).toBeUndefined();
});
it("複数人の競合とカメラ移動時には継続した自卓候補を返さない", () => {
  const tracker = new PersonTracker();
  const base = {
    nose: { x: 0.5, y: 0.25 },
    attention: 1,
    nearness: 1,
    raised: true,
    crossed: false,
    mouth: 0,
  };
  const first = tracker.observe([base], 0);
  expect(tracker.observe([base], 500)?.person).toBe(first?.person);
  const moved = tracker.observe([{ ...base, nose: { x: 0.7, y: 0.25 } }], 600);
  expect(moved?.person).not.toBe(first?.person);
  expect(moved?.score).toBeLessThan(1);
  expect(tracker.observe([base, { ...base, nose: { x: 0.8, y: 0.25 } }], 700)).toBeUndefined();
});
