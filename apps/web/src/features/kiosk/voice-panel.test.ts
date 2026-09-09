import { describe, expect, it } from "vitest";
import { mergeConversation, type ConversationLine } from "./conversation-model";

describe("逐次字幕と発話済み履歴の統合", () => {
  it("中断後は生成した全文ではなく保存済みの再生範囲だけを本文に残す", () => {
    const saved: ConversationLine = {
      id: "tablecast-event",
      role: "assistant",
      turnId: "tablecast-turn",
      text: "こちらの日本酒は",
      locale: "ja",
      createdAt: 1000,
      interrupted: true,
    };
    const merged = mergeConversation(
      [saved],
      {
        status: "paused",
        messages: [
          {
            id: "tablecast-turn",
            role: "assistant",
            turnId: "tablecast-turn",
            text: "こちらの日本酒は辛口です。",
            rawText: "[warm]こちらの日本酒は辛口です。",
            createdAt: 900,
            final: true,
            interrupted: true,
          },
        ],
      },
      "en",
    );
    expect(merged).toEqual([{ ...saved, rawText: "[warm]こちらの日本酒は辛口です。" }]);
  });
  it("字幕が同期を待つ間も元の言語を保持し空の認識確定を行として残さない", () => {
    const merged = mergeConversation(
      [],
      {
        status: "speaking",
        messages: [
          { id: "tablecast-empty", role: "user", text: "", createdAt: 100, final: true },
          {
            id: "tablecast-turn",
            role: "assistant",
            text: "Here are",
            locale: "en",
            createdAt: 200,
            final: true,
            displayIncomplete: true,
          },
        ],
      },
      "ja",
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      locale: "en",
      displayIncomplete: true,
      interrupted: false,
      live: false,
    });
  });
});
