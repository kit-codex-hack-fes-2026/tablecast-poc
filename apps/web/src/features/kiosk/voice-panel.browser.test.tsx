import type { TableEvent } from "@tablecast/api/schema";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { catalog, product } from "../../../.storybook/tablecast-fixtures";
import { MotionProvider } from "../../components/motion-provider";
import { LocaleProvider } from "../../i18n/locale";
import { VoicePanel } from "./voice-panel";
import { conversationLines, type ConversationLine } from "./conversation-model";
import type { LiveMessage } from "./voice-model";
import "../../styles.css";

const startedAt = 1788645000000;
function event(cursor: number, kind: string, data: Record<string, unknown>): TableEvent {
  return {
    cursor,
    kind,
    data,
    storeId: catalog.storeId,
    tableSessionId: "tablecast-session",
    createdAt: startedAt + cursor * 1000,
  };
}
const line: ConversationLine = {
  id: "tablecast-caption-event",
  turnId: "tablecast-caption-group",
  role: "user",
  text: "お茶をください",
  locale: "ja",
  createdAt: startedAt,
  interrupted: false,
};
const started = event(1, "voice.turn", { turnId: "tablecast-business", status: "started" });
const tool = event(2, "voice.tool", {
  turnId: "tablecast-business",
  toolCallId: "tablecast-call",
  toolName: "getCatalog",
  state: "running",
});
const caption = event(3, "voice.user", {
  role: "user",
  text: line.text,
  turnId: line.turnId,
  locale: "ja",
});
function Surface({ children, locale = "ja" }: { children: ReactNode; locale?: "ja" | "en" }) {
  return (
    <LocaleProvider initialLocale={locale}>
      <MotionProvider>
        <div className="h-160 max-w-2xl">{children}</div>
      </MotionProvider>
    </LocaleProvider>
  );
}
afterEach(async () => {
  await cleanup();
});

it("保存通知と字幕の続きが届いても吹き出しを作り直さず前後の発話やツールとの位置を保つ", async () => {
  const messages: LiveMessage[] = [
    {
      id: "tablecast-guest",
      turnId: "tablecast-guest",
      role: "user",
      text: "刺身に合う日本酒をください",
      createdAt: startedAt,
      final: true,
    },
    {
      id: "tablecast-reply",
      turnId: "tablecast-reply",
      role: "assistant",
      text: "辛口の日本酒です",
      createdAt: startedAt + 3000,
      final: false,
    },
    {
      id: "tablecast-next-guest",
      turnId: "tablecast-next-guest",
      role: "user",
      text: "冷やでお願いします",
      createdAt: startedAt + 4000,
      final: true,
    },
  ];
  const screen = await render(
    <Surface>
      <VoicePanel
        view={{ status: "speaking", messages }}
        lines={[]}
        events={[started, tool]}
        onStart={vi.fn<() => void>()}
      />
    </Surface>,
  );
  const beforeGuest = screen.getByText("刺身に合う日本酒をください").element().closest("article");
  const beforeReply = screen.getByText("辛口の日本酒です").element().closest("article");
  const nextGuest = screen.getByText("冷やでお願いします").element().closest("article");
  const menu = screen.getByText("実行中", { exact: true }).element();
  const events = [
    started,
    tool,
    event(6, "voice.user", {
      turnId: "tablecast-guest",
      role: "user",
      text: "刺身に合う日本酒をください",
      locale: "ja",
    }),
    event(7, "voice.assistant", {
      turnId: "tablecast-reply",
      role: "assistant",
      text: "辛口の日本酒です",
      locale: "ja",
    }),
  ];
  const continued = messages.map((message) =>
    message.role === "assistant"
      ? { ...message, text: "辛口の日本酒です。刺身によく合います。" }
      : message,
  );
  await screen.rerender(
    <Surface>
      <VoicePanel
        view={{ status: "speaking", messages: continued }}
        lines={conversationLines(events)}
        events={events}
        onStart={vi.fn<() => void>()}
      />
    </Surface>,
  );
  const reply = screen.getByText("辛口の日本酒です。刺身によく合います。");
  await expect.element(reply).toBeVisible();
  const guestArticle = screen.getByText("刺身に合う日本酒をください").element().closest("article");
  const replyArticle = reply.element().closest("article");
  expect(guestArticle).toBe(beforeGuest);
  expect(replyArticle).toBe(beforeReply);
  if (!guestArticle || !replyArticle || !nextGuest) throw new Error("会話の吹き出しがない");
  expect(
    guestArticle.compareDocumentPosition(menu) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    menu.compareDocumentPosition(replyArticle) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    replyArticle.compareDocumentPosition(nextGuest) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

it("字幕のIDが異なっても業務toolを実行中と表示し終了通知で中断へ切り替える", async () => {
  const screen = await render(
    <Surface>
      <VoicePanel
        view={{ status: "thinking" }}
        lines={[line]}
        events={[started, tool, caption]}
        onStart={vi.fn<() => void>()}
      />
    </Surface>,
  );
  await expect.element(screen.getByText("実行中", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("中断", { exact: true })).not.toBeInTheDocument();
  await screen.rerender(
    <Surface>
      <VoicePanel
        view={{ status: "listening" }}
        lines={[line]}
        events={[
          started,
          tool,
          caption,
          event(4, "voice.turn", { turnId: "tablecast-business", status: "interrupted" }),
        ]}
        onStart={vi.fn<() => void>()}
      />
    </Surface>,
  );
  await expect.element(screen.getByText("実行中", { exact: true })).not.toBeInTheDocument();
  await expect.element(screen.getByText("中断", { exact: true })).toBeVisible();
  await expect.element(screen.getByText(line.text)).toBeVisible();
});

it.each(["ja", "en"] as const)(
  "%sの検索語を保ってツールを待機から実行・失敗へ更新し音声接続を維持する",
  async (locale) => {
    const labels = {
      ja: {
        query: "刺身 日本酒",
        search: "検索：刺身 日本酒",
        waiting: "待機中",
        running: "実行中",
        failed: "エラー",
        complete: "完了",
        failure: "今回の照会を完了できませんでした。注文結果は注文かご・履歴で確認できます。",
        connectionError: "音声に接続できません",
        stop: "音声を停止",
        debug: "デバッグ表示",
      },
      en: {
        query: "sashimi sake",
        search: "Search: sashimi sake",
        waiting: "Waiting",
        running: "Running",
        failed: "Failed",
        complete: "Complete",
        failure:
          "This request could not be completed. Check your basket and order history for the result.",
        connectionError: "Voice is unavailable",
        stop: "Stop voice",
        debug: "Show debug details",
      },
    }[locale];
    const request = event(2, "voice.tool", {
      turnId: "tablecast-business",
      toolCallId: "tablecast-search-call",
      toolName: "getCatalog",
      state: "requested",
      query: labels.query,
    });
    const running = event(3, "voice.tool", { ...request.data, state: "running" });
    const failure = event(4, "voice.tool", {
      ...request.data,
      state: "error",
      errorCode: "STORE_CONFIG_STALE",
    });
    const screen = await render(
      <Surface locale={locale}>
        <VoicePanel
          view={{ status: "thinking" }}
          lines={[line]}
          events={[started, request]}
          onStart={vi.fn<() => void>()}
        />
      </Surface>,
    );
    await expect.element(screen.getByText(labels.waiting, { exact: true })).toBeVisible();
    await expect
      .element(screen.getByText(labels.complete, { exact: true }))
      .not.toBeInTheDocument();
    await expect.element(screen.getByText(labels.search, { exact: true })).toBeVisible();
    await expect.element(screen.getByText(/tablecast-search-call/)).not.toBeInTheDocument();
    await screen.rerender(
      <Surface locale={locale}>
        <VoicePanel
          view={{ status: "thinking" }}
          lines={[line]}
          events={[started, request, running]}
          onStart={vi.fn<() => void>()}
        />
      </Surface>,
    );
    await expect.element(screen.getByText(labels.running, { exact: true })).toBeVisible();
    await expect.element(screen.getByText(labels.waiting, { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByText(labels.search, { exact: true })).toBeVisible();
    await screen.rerender(
      <Surface locale={locale}>
        <VoicePanel
          view={{ status: "listening" }}
          lines={[line]}
          events={[
            started,
            request,
            running,
            failure,
            event(5, "voice.failed", { turnId: "tablecast-business", code: "VOICE_MODEL_FAILED" }),
            event(6, "voice.turn", { turnId: "tablecast-business", status: "failed" }),
          ]}
          onStart={vi.fn<() => void>()}
        />
      </Surface>,
    );
    await expect.element(screen.getByText(labels.failed, { exact: true })).toBeVisible();
    await expect.element(screen.getByText(labels.failure, { exact: true })).toBeVisible();
    await expect.element(screen.getByText(labels.search, { exact: true })).toBeVisible();
    await expect.element(screen.getByText(labels.waiting, { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByText(labels.running, { exact: true })).not.toBeInTheDocument();
    await expect
      .element(screen.getByText(labels.connectionError, { exact: true }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: labels.stop, exact: true }))
      .toBeEnabled();
    await expect.element(screen.getByText(/STORE_CONFIG_STALE/)).not.toBeInTheDocument();
    await screen.getByRole("button", { name: labels.debug, exact: true }).click();
    await expect
      .element(
        screen.getByText("getCatalog · tablecast-search-call · STORE_CONFIG_STALE", {
          exact: true,
        }),
      )
      .toBeVisible();
  },
);

it("商品カードだけの業務イベントも字幕と独立して時系列に一度だけ表示する", async () => {
  const choose = vi.fn<(value: typeof product) => void>();
  const later: ConversationLine = {
    ...line,
    id: "tablecast-next-caption",
    turnId: "tablecast-next-group",
    text: "このお茶ですね",
    createdAt: startedAt + 5000,
  };
  const screen = await render(
    <Surface>
      <VoicePanel
        view={{ status: "paused" }}
        lines={[line, later]}
        events={[
          event(2, "voice.products", { turnId: "tablecast-business", productIds: [product.id] }),
        ]}
        catalog={catalog}
        onChoose={choose}
        onStart={vi.fn<() => void>()}
      />
    </Surface>,
  );
  const card = screen.getByRole("button", { name: /月凪/ });
  await expect.element(card).toBeVisible();
  const before = screen.getByText(line.text).element();
  const after = screen.getByText(later.text).element();
  expect(
    before.compareDocumentPosition(card.element()) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    card.element().compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  await card.click();
  expect(choose).toHaveBeenCalledOnce();
  expect(choose).toHaveBeenCalledWith(product);
});

it("最新業務の失敗は後から届いた字幕で隠さず次の業務を始めると片付ける", async () => {
  const failure = event(3, "voice.failed", {
    turnId: "tablecast-business",
    code: "VOICE_MODEL_FAILED",
  });
  const later: ConversationLine = { ...line, createdAt: startedAt + 6000 };
  const events = [
    started,
    tool,
    failure,
    event(4, "voice.turn", { turnId: "tablecast-business", status: "failed" }),
    caption,
  ];
  const screen = await render(
    <Surface>
      <VoicePanel
        view={{ status: "listening" }}
        lines={[later]}
        events={events}
        onStart={vi.fn<() => void>()}
      />
    </Surface>,
  );
  await expect
    .element(
      screen.getByText(
        "今回の照会を完了できませんでした。注文結果は注文かご・履歴で確認できます。",
      ),
    )
    .toBeVisible();
  await expect.element(screen.getByText("実行中", { exact: true })).not.toBeInTheDocument();
  await screen.rerender(
    <Surface>
      <VoicePanel
        view={{ status: "thinking" }}
        lines={[later]}
        events={[
          ...events,
          event(5, "voice.turn", { turnId: "tablecast-next-business", status: "started" }),
        ]}
        onStart={vi.fn<() => void>()}
      />
    </Surface>,
  );
  await expect
    .element(
      screen.getByText(
        "今回の照会を完了できませんでした。注文結果は注文かご・履歴で確認できます。",
      ),
    )
    .not.toBeInTheDocument();
});
