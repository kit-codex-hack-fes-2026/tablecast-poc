import type { TableEvent } from "@tablecast/api/schema";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { catalog, product } from "../../../.storybook/tablecast-fixtures";
import { MotionProvider } from "../../components/motion-provider";
import { LocaleProvider } from "../../i18n/locale";
import { VoicePanel } from "./voice-panel";
import type { ConversationLine } from "./conversation-model";
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
function Surface({ children }: { children: ReactNode }) {
  return (
    <LocaleProvider initialLocale="ja">
      <MotionProvider>
        <div className="h-160 max-w-2xl">{children}</div>
      </MotionProvider>
    </LocaleProvider>
  );
}
afterEach(async () => {
  await cleanup();
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
    .element(screen.getByText("音声の返答が途切れました。注文結果は注文かご・履歴で確認できます。"))
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
    .element(screen.getByText("音声の返答が途切れました。注文結果は注文かご・履歴で確認できます。"))
    .not.toBeInTheDocument();
});
