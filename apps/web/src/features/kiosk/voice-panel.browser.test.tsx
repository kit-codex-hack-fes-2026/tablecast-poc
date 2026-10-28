import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { LiveMessage } from "./voice-model";
import { StoreTheme } from "../../components/store-theme";
import { catalog, product } from "../../test-support/tablecast-fixtures";
import "../../styles.css";
import { type ConversationLine, conversationLines } from "./conversation-model";
import {
  caption,
  event,
  line,
  started,
  startedAt,
  Surface,
  tool,
} from "./test-support/voice-panel-fixture";
import { VoicePanel } from "./voice-panel";

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
  const camera = document.querySelector("video");
  const controls = document.querySelector("[data-theme-part=voice-controls]");
  const controlsBottom = controls?.getBoundingClientRect().bottom;
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
  expect(document.querySelector("video")).toBe(camera);
  expect(document.querySelector("[data-theme-part=voice-controls]")).toBe(controls);
  expect(controls?.getBoundingClientRect().bottom).toBe(controlsBottom);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const animatedTranscript = replyArticle?.querySelector("[data-sd-animate]");
  expect(reducedMotion && Boolean(animatedTranscript)).toBe(false);
  const reducedMotionAnimations = reducedMotion ? document.getAnimations() : [];
  expect(
    reducedMotionAnimations.every(
      (animation) => Number(animation.effect?.getTiming().duration) <= 1,
    ),
  ).toBe(true);
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
  "%sで旧検索引数の商品IDを見せず、処理状態と音声接続を維持する",
  async (locale) => {
    const labels = {
      ja: {
        query: "tablecast-internal-product-ja",
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
        query: "tablecast-internal-product-en",
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
      arguments: { productIds: [labels.query], optionId: "tablecast-internal-option" },
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
    await expect.element(screen.getByText(new RegExp(labels.query))).not.toBeInTheDocument();
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
    await expect.element(screen.getByText(new RegExp(labels.query))).not.toBeInTheDocument();
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
    await expect.element(screen.getByText(new RegExp(labels.query))).not.toBeInTheDocument();
    await expect.element(screen.getByText(labels.waiting, { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByText(labels.running, { exact: true })).not.toBeInTheDocument();
    await expect
      .element(screen.getByText(labels.connectionError, { exact: true }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: labels.stop, exact: true }))
      .toBeEnabled();
    await expect.element(screen.getByText(/STORE_CONFIG_STALE/)).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: labels.debug, exact: true }))
      .not.toBeInTheDocument();
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
      <StoreTheme appearance={{ parts: { "product-card": { font: "serif" } } }}>
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
      </StoreTheme>
    </Surface>,
  );
  const card = screen.getByRole("button", { name: /月凪/ });
  await expect.element(card).toBeVisible();
  expect(getComputedStyle(card.element()).fontFamily).toContain("sans-serif");
  const before = screen.getByText(line.text).element();
  const after = screen.getByText(later.text).element();
  expect(
    before.compareDocumentPosition(card.element()) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    card.element().compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  // 停止中の中央音声ボタンを避け、見えている商品名から選択する。
  await card.getByText(product.text.ja.displayName, { exact: true }).click();
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
