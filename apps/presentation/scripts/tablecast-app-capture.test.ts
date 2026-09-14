import { expect, test } from "vitest";
import { tablecastResponseComplete } from "./tablecast-app-capture";

test("分割発話の最後のターンへの応答完了を判定する", () => {
  const events = [
    { kind: "voice.user", createdAt: 100, data: { turnId: "first" } },
    { kind: "voice.user", createdAt: 200, data: { turnId: "last" } },
    { kind: "voice.assistant", createdAt: 300, data: { turnId: "last", interrupted: false } },
  ];
  expect(tablecastResponseComplete(events, 100)).toBe(true);
  expect(tablecastResponseComplete(events.slice(0, 2), 100)).toBe(false);
});

test("先行ターンだけの完了や割込みを最後の応答完了と扱わない", () => {
  const events = [
    { kind: "voice.user", createdAt: 100, data: { turnId: "first" } },
    { kind: "voice.assistant", createdAt: 150, data: { turnId: "first", interrupted: false } },
    { kind: "voice.user", createdAt: 200, data: { turnId: "last" } },
  ];
  expect(tablecastResponseComplete(events, 100)).toBe(false);
  expect(
    tablecastResponseComplete(
      [
        ...events,
        { kind: "voice.assistant", createdAt: 300, data: { turnId: "last", interrupted: true } },
      ],
      100,
    ),
  ).toBe(false);
});

test("入力前の会話やターンIDのない発話では完了しない", () => {
  const events = [
    { kind: "voice.user", createdAt: 100, data: { turnId: "old" } },
    { kind: "voice.assistant", createdAt: 150, data: { turnId: "old" } },
  ];
  expect(tablecastResponseComplete(events, 200)).toBe(false);
  expect(
    tablecastResponseComplete([...events, { kind: "voice.user", createdAt: 200, data: {} }], 200),
  ).toBe(false);
  expect(tablecastResponseComplete([], 100)).toBe(false);
});
