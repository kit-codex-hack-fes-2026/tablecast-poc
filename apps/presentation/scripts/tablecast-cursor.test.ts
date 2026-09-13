import { test, expect } from "vitest";
import { cursorAt } from "./tablecast-cursor";
const events = [
  { at: 100, x: 10, y: 20, cursorType: "arrow", interactionType: "move" as const },
  { at: 1100, x: 100, y: 200, cursorType: "arrow", interactionType: "move" as const },
  { at: 1200, x: 150, y: 220, cursorType: "pointer", interactionType: "click" as const },
  { at: 1300, x: 150, y: 220, cursorType: "pointer", interactionType: "mouseup" as const },
];
test("操作前後だけを表示し、待機中の手や矢印を残さない", () => {
  expect(cursorAt(events, 500)).toBeNull();
  expect(cursorAt(events, 1150)).toMatchObject({ x: 125, y: 210, type: "arrow" });
  expect(cursorAt(events, 1200)).toMatchObject({ x: 150, y: 220, type: "pointer" });
  expect(cursorAt(events, 1500)?.type).toBe("pointer");
  expect(cursorAt(events, 1600)).toBeNull();
  expect(
    cursorAt(
      [...events, { at: 4000, x: 150, y: 220, cursorType: "pointer", interactionType: "click" }],
      3450,
    ),
  ).toBeNull();
});
