import { expect, it } from "vitest";
import {
  assistanceHandoff,
  assistanceNotification,
  type AssistanceState,
} from "./staff-assistance-model";

it("英語の用件ボタンから日本語の要約と原文を作る", () => {
  expect(
    assistanceHandoff(undefined, { query: "Water" }, { status: "idle" }, 200, "en"),
  ).toMatchObject({
    summaryJa: "お冷について店員の対応を希望しています。",
    originalText: "Water",
    locale: "en",
  });
});
it("今回の相談より前の個人的な発話を引き継がない", () => {
  const input = assistanceHandoff(
    undefined,
    {},
    {
      status: "listening",
      messages: [
        {
          id: "tablecast-private",
          role: "user",
          final: true,
          text: "以前の個人的な相談",
          createdAt: 100,
          locale: "ja",
        },
      ],
    },
    200,
    "ja",
  );
  expect(input.originalText).toBe("");
  expect(input.summaryJa).toBeUndefined();
});

it("閉じた後の古い案内通知は消費しても吹き出しを再表示しない", () => {
  const state: AssistanceState = {
    open: false,
    tab: "advice",
    selection: {},
    voiceProductIds: [],
    mountedCursor: 0,
    openedAt: 100,
    dismissedAt: 200,
    shownCursor: 0,
  };
  const event = {
    cursor: 1,
    storeId: "tablecast-store",
    tableSessionId: "tablecast-visit",
    kind: "assistance.shown",
    createdAt: 250,
    data: { voiceSessionId: "tablecast-voice", configVersion: 1, guideIds: [], productIds: [] },
  };
  expect(
    assistanceNotification(state, [event], "tablecast-voice", 1, {
      status: "listening",
      messages: [],
    }),
  ).toMatchObject({ open: false, shownCursor: 1 });
  expect(
    assistanceNotification(state, [event], "tablecast-other-voice", 1, { status: "listening" }),
  ).toBeNull();
});
