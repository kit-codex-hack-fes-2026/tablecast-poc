import { describe, expect, it } from "vitest";
import type { TableEvent } from "@tablecast/api/schema";
import type { LiveMessage } from "./voice-model";
import { conversationLines, mergeConversation, type ConversationLine } from "./conversation-model";

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
    expect(merged).toEqual([
      expect.objectContaining({
        ...saved,
        id: "live-assistant-tablecast-turn",
        createdAt: 900,
        rawText: "[warm]こちらの日本酒は辛口です。",
        live: false,
      }),
    ]);
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
  it.each([
    ["後の時刻", 1500],
    ["同じ時刻", 1000],
  ])("%sの返答中に客の字幕が保存されても吹き出しの順序とIDを維持する", (_label, replyAt) => {
    const messages: LiveMessage[] = [
      {
        id: "tablecast-guest",
        turnId: "tablecast-guest",
        role: "user",
        text: "刺身に合う日本酒をください",
        createdAt: 1000,
        final: true,
      },
      {
        id: "tablecast-reply",
        turnId: "tablecast-reply",
        role: "assistant",
        text: "おすすめの日本酒は",
        createdAt: replyAt,
        final: false,
      },
    ];
    const saved: TableEvent = {
      cursor: 42,
      storeId: "tablecast-store",
      tableSessionId: "tablecast-session",
      kind: "voice.user",
      data: {
        turnId: "tablecast-guest",
        role: "user",
        text: "刺身に合う日本酒をください",
        locale: "ja",
      },
      createdAt: 4000,
    };
    const before = mergeConversation([], { status: "speaking", messages }, "ja");
    const after = mergeConversation(
      conversationLines([saved]),
      { status: "speaking", messages },
      "ja",
    );
    expect(before.map(({ id }) => id)).toEqual([
      "live-user-tablecast-guest",
      "live-assistant-tablecast-reply",
    ]);
    expect(after.map(({ id, createdAt }) => ({ id, createdAt }))).toEqual(
      before.map(({ id, createdAt }) => ({ id, createdAt })),
    );
  });
  it.each([false, true])("短い保存本文より新しい字幕を表示する（字幕確定: %s）", (final) => {
    const saved: ConversationLine = {
      id: "tablecast-event",
      turnId: "tablecast-reply",
      role: "assistant",
      text: "辛口の日本酒です",
      locale: "ja",
      createdAt: 4000,
      interrupted: false,
    };
    const merged = mergeConversation(
      [saved],
      {
        status: "speaking",
        messages: [
          {
            id: "tablecast-reply",
            turnId: "tablecast-reply",
            role: "assistant",
            text: "辛口の日本酒です。刺身によく合います。",
            createdAt: 1000,
            final,
          },
        ],
      },
      "ja",
    );
    expect(merged).toEqual([
      expect.objectContaining({
        id: "live-assistant-tablecast-reply",
        text: "辛口の日本酒です。刺身によく合います。",
        createdAt: 1000,
        live: !final,
      }),
    ]);
  });
});
