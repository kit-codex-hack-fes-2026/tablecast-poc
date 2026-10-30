import type { StandbyObservation } from "./standby-model";
export type Point = { visibility?: number; x: number; y: number };
export const landmark = (points: readonly Point[], index: number): Point =>
  points[index] ?? { x: Number.NaN, y: Number.NaN, visibility: 0 };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const near = (a: Point, b: Point, radius: number) => distance(a, b) < radius;
function crosses(a: Point, b: Point, c: Point, d: Point) {
  const side = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}
function indexExtended(hand: Point[]) {
  const wrist = landmark(hand, 0);
  return (
    hand.length >= 21 &&
    distance(landmark(hand, 8), wrist) > distance(landmark(hand, 6), wrist) * 1.15 &&
    [12, 16, 20].every(
      (tip) =>
        distance(landmark(hand, tip), wrist) < distance(landmark(hand, tip - 2), wrist) * 1.15,
    )
  );
}
export function personFeatures(pose: Point[], face: Point[], hands: Point[][], depth: number) {
  if (
    pose.length < 33 ||
    face.length < 478 ||
    ![0, 11, 12, 15, 16].every((index) => (landmark(pose, index).visibility ?? 0) >= 0.65)
  )
    return undefined;
  if (!near(landmark(pose, 0), landmark(face, 1), 0.12)) return undefined;
  const width = distance(landmark(face, 234), landmark(face, 454));
  const shoulders = distance(landmark(pose, 11), landmark(pose, 12));
  if (width < 0.12 || shoulders < 0.18 || !Number.isFinite(depth) || depth < 0.55) return undefined;
  const nose = landmark(face, 1);
  const centre = (landmark(face, 234).x + landmark(face, 454).x) / 2;
  const head = clamp(1 - Math.abs(nose.x - centre) / (width * 0.25));
  const iris = (left: number, right: number, pupil: number) => {
    const ratio =
      (landmark(face, pupil).x - landmark(face, left).x) /
      (landmark(face, right).x - landmark(face, left).x);
    return clamp(1 - Math.abs(ratio - 0.5) * 5);
  };
  const vertical = (top: number, bottom: number, pupil: number) => {
    const ratio =
      (landmark(face, pupil).y - landmark(face, top).y) /
      (landmark(face, bottom).y - landmark(face, top).y);
    return clamp(1 - Math.abs(ratio - 0.5) * 4);
  };
  const attention = Math.min(
    head,
    iris(33, 133, 468),
    iris(362, 263, 473),
    vertical(159, 145, 468),
    vertical(386, 374, 473),
  );
  if (!Number.isFinite(attention) || attention < 0.7) return undefined;
  const left = hands.filter(
    (hand) => hand.length === 21 && near(landmark(hand, 0), landmark(pose, 15), shoulders * 0.3),
  );
  const right = hands.filter(
    (hand) => hand.length === 21 && near(landmark(hand, 0), landmark(pose, 16), shoulders * 0.3),
  );
  // 交差時にも同じ手を左右へ割り当てず、対応の曖昧なフレームを棄却する。
  const paired =
    left.length === 1 && right.length === 1 && (left.at(0) ?? []) !== (right.at(0) ?? []);
  const crossed =
    paired &&
    indexExtended(left.at(0) ?? []) &&
    indexExtended(right.at(0) ?? []) &&
    crosses(
      landmark(left.at(0) ?? [], 5),
      landmark(left.at(0) ?? [], 8),
      landmark(right.at(0) ?? [], 5),
      landmark(right.at(0) ?? [], 8),
    ) &&
    Math.max(landmark(left.at(0) ?? [], 8).y, landmark(right.at(0) ?? [], 8).y) <
      Math.max(landmark(pose, 11).y, landmark(pose, 12).y);
  const raised =
    (left.length === 1 && landmark(pose, 15).y < landmark(pose, 11).y - 0.06) ||
    (right.length === 1 && landmark(pose, 16).y < landmark(pose, 12).y - 0.06);
  if (![width, shoulders, attention, nose.x, nose.y].every(Number.isFinite)) return undefined;
  return {
    nose,
    nearness: Math.min(clamp(width / 0.2), depth),
    attention,
    raised,
    crossed,
    mouth: distance(landmark(face, 13), landmark(face, 14)) / width,
  };
}

export class PersonTracker {
  private next = 0;
  private tracks: { at: number; id: number; nose: Point; since: number }[] = [];
  reset() {
    this.tracks = [];
  }
  observe(
    people: NonNullable<ReturnType<typeof personFeatures>>[],
    at: number,
  ): StandbyObservation | undefined {
    const assigned = new Set<number>();
    const previous = this.tracks;
    const candidates: StandbyObservation[] = [];
    this.tracks = people.map((person) => {
      const matches = previous.filter(
        (track) =>
          !assigned.has(track.id) && at - track.at < 750 && near(track.nose, person.nose, 0.04),
      );
      const prior = matches.length === 1 ? matches[0] : undefined;
      const id = prior?.id ?? ++this.next;
      assigned.add(id);
      const track = { id, nose: person.nose, at, since: prior?.since ?? at };
      candidates.push({
        at,
        person: track.id,
        attention: person.attention,
        raised: person.raised,
        crossed: person.crossed,
        mouth: person.mouth,
        score:
          person.nearness * 0.45 + person.attention * 0.35 + clamp((at - track.since) / 1500) * 0.2,
      });
      return track;
    });
    candidates.sort((a, b) => b.score - a.score);
    if (!candidates[0] || (candidates[1] && candidates[0].score - candidates[1].score < 0.15))
      return undefined;
    return candidates[0];
  }
}
