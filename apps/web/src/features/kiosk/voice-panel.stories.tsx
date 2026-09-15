import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { catalog, product } from "../../../.storybook/tablecast-fixtures";
import { VoicePanel } from "./voice-panel";

const meta = {
  title: "客向け/会話",
  component: VoicePanel,
  decorators: [
    (Story) => (
      <div className="h-160 max-w-2xl">
        <Story />
      </div>
    ),
  ],
  args: { view: { status: "idle" }, lines: [], onStart: fn(), onSuggestion: fn() },
} satisfies Meta<typeof VoicePanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Welcome: Story = {
  name: "日本語の初回表示",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const resume = canvas.getByRole("button", { name: "音声を再開" });
    await expect(resume.closest("footer")).not.toBeNull();
    await userEvent.click(resume);
    await expect(args.onStart).toHaveBeenCalledOnce();
    await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument();
  },
};
export const English: Story = { name: "英語の初回表示", globals: { locale: "en" } };
export const ReplyHints: Story = {
  name: "店舗に合う具体的な返答とタップ送信",
  args: {
    view: {
      status: "listening",
      suggestions: [
        "こもれび 月凪 純米吟醸は、どんな香りや味わいのお酒ですか？ 合わせる料理を選びたいので、お店のメニューから相性のよいものも教えてください。",
        "こもれび 月凪 純米吟醸の60 mLと90 mLでは、料金はそれぞれいくらですか？ 注文する前に、容量の選び方を教えてください。",
        "まず料理のメニューを見てから、お酒を選びたいです。こもれび 月凪 純米吟醸の注文はまだせず、料理の種類を案内してください。",
      ],
    },
    lines: [
      {
        id: "tablecast-opening",
        role: "assistant",
        text: "いらっしゃいませ。本日はこもれび 月凪 純米吟醸をご用意しています。お酒の特徴や料理との合わせ方をご案内しましょうか？",
        locale: "ja",
        createdAt: 1788645000000,
        interrupted: false,
      },
    ],
  },
};
export const EnglishReplyHints: Story = {
  name: "英語の開始案内と返答例",
  globals: { locale: "en" },
  args: {
    view: {
      status: "listening",
      suggestions: [
        "Could you tell me more about the aroma and flavour of Komorebi Tsukinagi junmai ginjo? I would also like to hear which dishes on your menu pair well with it before choosing what to order.",
        "How much do the 60 mL and 90 mL servings of Komorebi Tsukinagi cost? Please explain the serving options before I place an order.",
        "I would like to look at the food menu before choosing a sake. Please show me the dishes available, without adding Komorebi Tsukinagi to my order yet.",
      ],
    },
    lines: [
      {
        id: "tablecast-opening",
        role: "assistant",
        text: "Welcome. We have Komorebi Tsukinagi junmai ginjo on our menu. Would you like to hear about its flavour and food pairings?",
        locale: "en",
        createdAt: 1788645000000,
        interrupted: false,
      },
    ],
  },
};
export const Paused: Story = {
  name: "停止しても会話を保持",
  args: {
    view: { status: "paused" },
    lines: [
      {
        id: "one",
        role: "user",
        text: "この日本酒は温かくできますか？",
        locale: "ja",
        createdAt: 1788645000000,
        interrupted: false,
      },
      {
        id: "two",
        role: "assistant",
        text: "はい、熱燗にできます。容量は九十ミリと百八十ミリ、どちらになさいますか？",
        locale: "ja",
        createdAt: 1788645005000,
        interrupted: false,
      },
    ],
  },
};
export const LongEnglish: Story = {
  name: "長い英語と中断履歴",
  globals: { locale: "en" },
  args: {
    view: { status: "paused" },
    lines: Array.from({ length: 8 }, (_, index) => ({
      id: String(index),
      role: index % 2 === 0 ? "user" : "assistant",
      text:
        index % 2 === 0
          ? "Could you tell us which dishes are suitable for someone with a dairy allergy? We would also like to know about the ingredients in the seasonal special."
          : "I can explain the ingredients we have on record. Shared utensils may be used in preparation, so I would like a member of staff to confirm any allergy requirements with you.",
      locale: "en",
      createdAt: 1788645000000 + index * 5000,
      interrupted: index === 7,
    })),
  },
};
export const Connecting: Story = { name: "接続中", args: { view: { status: "connecting" } } };
export const PermissionDenied: Story = {
  name: "マイク許可拒否",
  args: { view: { status: "error", error: "permission" } },
};
export const Unconfigured: Story = {
  name: "外部設定不足",
  args: { view: { status: "error", error: "unconfigured" } },
};

export const AlreadyActive: Story = {
  name: "別の音声接続が有効",
  args: { view: { status: "error", error: "active" } },
};

export const Streaming: Story = {
  name: "逐次本文と演技タグの切替",
  args: {
    view: {
      status: "thinking",
      messages: [
        {
          id: "tablecast-turn",
          turnId: "tablecast-turn",
          role: "assistant",
          text: "すっきりした日本酒なら",
          rawText: "[warm and friendly]すっきりした日本酒なら",
          final: false,
          createdAt: 1788645001000,
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("すっきりした日本酒なら")).toBeVisible();
    await expect(canvas.queryByText(/warm and friendly/)).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "デバッグ表示" }));
    await userEvent.click(canvas.getByText("発話タグ・生成原文"));
    await expect(canvas.getByText(/warm and friendly/)).toBeVisible();
    await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument();
  },
};
export const ToolAndCards: Story = {
  name: "ツール状態と操作できる商品カード",
  args: {
    view: { status: "thinking" },
    catalog,
    onChoose: fn(),
    events: [
      {
        cursor: 1,
        storeId: catalog.storeId,
        tableSessionId: "tablecast-session",
        createdAt: 1788645000000,
        kind: "voice.tool",
        data: {
          turnId: "tablecast-turn",
          toolCallId: "tablecast-tool",
          toolName: "getCatalog",
          state: "completed",
        },
      },
      {
        cursor: 2,
        storeId: catalog.storeId,
        tableSessionId: "tablecast-session",
        createdAt: 1788645000100,
        kind: "voice.tool",
        data: {
          turnId: "tablecast-turn",
          toolCallId: "tablecast-tool-two",
          toolName: "showProducts",
          state: "running",
        },
      },
      {
        cursor: 3,
        storeId: catalog.storeId,
        tableSessionId: "tablecast-session",
        createdAt: 1788645000200,
        kind: "voice.products",
        data: { turnId: "tablecast-turn", productIds: [product.id, "tablecast-sold-out"] },
      },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("完了", { exact: true })).toBeVisible();
    await expect(canvas.getByText("実行中", { exact: true })).toBeVisible();
    await expect(canvasElement.querySelector("figure[data-voice-state=tool]")).toBeVisible();
    await expect(canvas.getByRole("button", { name: /白霞/ })).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: /月凪/ }));
    await expect(args.onChoose).toHaveBeenCalledWith(product);
  },
};
export const Speakers: Story = {
  name: "話者IDと未識別の発話",
  args: {
    view: { status: "listening" },
    lines: [
      {
        id: "speaker-one",
        role: "user",
        text: "辛口が好きです。",
        locale: "ja",
        createdAt: 1788645000000,
        interrupted: false,
        speaker: "tablecast-stream:0",
        streamId: "tablecast-stream",
      },
      {
        id: "speaker-two",
        role: "user",
        text: "私は甘口で。",
        locale: "ja",
        createdAt: 1788645001000,
        interrupted: false,
        speaker: "tablecast-stream:1",
        streamId: "tablecast-stream",
      },
      {
        id: "speaker-unknown",
        role: "user",
        text: "おすすめも教えてください。",
        locale: "ja",
        createdAt: 1788645002000,
        interrupted: false,
      },
    ],
  },
  play: async ({ canvasElement, globals, step }) => {
    const canvas = within(canvasElement);
    const english = globals.locale === "en";
    const unknown = canvas.getByText("おすすめも教えてください。").closest("article");
    if (!unknown) throw new Error("客の発話が表示されていません。");
    const details = english ? "Speaker metadata unavailable" : "話者情報なし（推定しません）";
    await step("前提: 実話者の番号だけを表示し、欠損は通常の客ラベルにする", async () => {
      await expect(canvas.getByText(english ? "Speaker 0" : "話者 0")).toBeVisible();
      await expect(canvas.getByText(english ? "Speaker 1" : "話者 1")).toBeVisible();
      await expect(within(unknown).getByText(english ? "You" : "お客さま")).toBeVisible();
      await expect(canvas.queryByText(details)).not.toBeInTheDocument();
    });
    await step("操作と結果: debugでだけ話者欠損と接続の範囲を確認できる", async () => {
      await userEvent.click(
        canvas.getByRole("button", { name: english ? "Show debug details" : "デバッグ表示" }),
      );
      await expect(within(unknown).getByText(details)).toBeVisible();
      await expect(canvas.getAllByText("STT tablecast-stream")).toHaveLength(2);
    });
  },
};
export const EnglishSpeakers: Story = {
  ...Speakers,
  name: "英語で話者の欠損と接続範囲を表示",
  globals: { locale: "en" },
};
export const EmptyInterruption: Story = {
  name: "本文のない中断を吹き出しにせず、停止後も既存会話を保つ",
  args: {
    ...Paused.args,
    view: {
      status: "paused",
      messages: [
        {
          id: "tablecast-empty-turn",
          turnId: "tablecast-empty-turn",
          role: "assistant",
          text: "",
          rawText: "",
          interrupted: true,
          final: true,
          createdAt: 1788645006000,
        },
      ],
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("article")).toHaveLength(2);
    await expect(canvas.queryByText("中断", { exact: true })).not.toBeInTheDocument();
    const resume = canvas.getByRole("button", { name: "音声を再開" });
    await expect(resume.closest("footer")).not.toBeNull();
    await userEvent.click(resume);
    await expect(args.onStart).toHaveBeenCalledOnce();
    await expect(canvas.getByText("この日本酒は温かくできますか？")).toBeVisible();
  },
};
export const SpeechSpeed: Story = {
  name: "話速をキーボードで変更して範囲内の値を送る",
  args: { view: { status: "paused" }, speechSpeed: 1.0, onSpeedChange: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const speed = canvas.getByRole("slider", { name: "話す速さ" });
    await expect(speed).toHaveAttribute("aria-valuenow", "1");
    speed.focus();
    await userEvent.keyboard("[ArrowRight]");
    await expect(args.onSpeedChange).toHaveBeenLastCalledWith(1.1);
    await userEvent.keyboard("[End]");
    await expect(args.onSpeedChange).toHaveBeenLastCalledWith(1.5);
    await userEvent.keyboard("[Home]");
    await expect(args.onSpeedChange).toHaveBeenLastCalledWith(0.5);
  },
};
export const EnglishTools: Story = {
  ...ToolAndCards,
  name: "英語のツール表示",
  globals: { locale: "en" },
  play: undefined,
};

export const SpeakingWithTool: Story = {
  ...ToolAndCards,
  name: "先に話しながらツールを実行",
  args: { ...ToolAndCards.args, view: { status: "speaking" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const visual = canvas.getByRole("figure");
    await expect(visual).toBeVisible();
    await expect(visual).toHaveAttribute("data-voice-state", "speaking");
    await expect(within(visual).getByText("商品を表示", { exact: true })).toBeVisible();
  },
};
export const PausedWithStaleTool: Story = {
  ...ToolAndCards,
  name: "停止後に古いツールを実行中と表示しない",
  args: { ...ToolAndCards.args, view: { status: "paused" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const visual = canvas.getByRole("figure");
    await expect(visual).toBeVisible();
    await expect(visual).toHaveAttribute("data-voice-state", "paused");
    await expect(visual).toHaveAttribute("data-motion", "still");
    await expect(within(visual).queryByText("商品を表示", { exact: true })).not.toBeInTheDocument();
    await expect(canvas.getByText("中断", { exact: true })).toBeVisible();
  },
};

export const MicrophoneSelection: Story = {
  name: "停止中にマイクを選択しキーボードで閉じても音声を開始しない",
  args: {
    view: {
      status: "paused",
      microphone: {
        selectedId: "default",
        devices: [
          { deviceId: "built-in", label: "内蔵マイク" },
          { deviceId: "external", label: "外部USBマイク" },
        ],
      },
    },
    speechSpeed: 1,
    onSpeedChange: fn(),
    onMicrophoneChange: fn(),
    onMicrophoneRefresh: fn(),
  },
  render: function MicrophoneStory(args) {
    const [view, setView] = useState(args.view);
    return (
      <VoicePanel
        {...args}
        view={view}
        onMicrophoneChange={(deviceId) => {
          args.onMicrophoneChange?.(deviceId);
          setView((current) => ({
            ...current,
            microphone: { devices: current.microphone?.devices ?? [], selectedId: deviceId },
          }));
        }}
      />
    );
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("button", { name: "マイク設定" });
    const bounds = trigger.getBoundingClientRect();
    await expect(bounds.width).toBe(bounds.height);
    await expect(bounds.width).toBeGreaterThanOrEqual(44);
    const speed = canvas.getByRole("slider", { name: "話す速さ" }).getBoundingClientRect();
    await expect(bounds.left).toBeGreaterThan(speed.right);
    trigger.focus();
    await userEvent.keyboard("[Enter]");
    const dialog = await body.findByRole("dialog", { name: "マイク設定" });
    await waitFor(() => expect(dialog).toBeVisible());
    const select = within(dialog).getByRole("combobox", { name: "入力マイク" });
    select.focus();
    await userEvent.keyboard("[ArrowDown]");
    await waitFor(() =>
      expect(body.getByRole("option", { name: "端末の既定のマイク" })).toHaveFocus(),
    );
    await userEvent.keyboard("[End]");
    await waitFor(() => expect(body.getByRole("option", { name: "外部USBマイク" })).toHaveFocus());
    await userEvent.keyboard("[Enter]");
    await waitFor(() => expect(select).toHaveTextContent("外部USBマイク"));
    await waitFor(() => expect(args.onMicrophoneChange).toHaveBeenCalledWith("external"));
    await expect(args.onStart).not.toHaveBeenCalled();
    await userEvent.keyboard("[Escape]");
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
export const MicrophoneEnglish: Story = {
  ...MicrophoneSelection,
  name: "英語のマイク設定と停止中の案内",
  globals: { locale: "en" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Microphone settings" }));
    const dialog = within(canvasElement.ownerDocument.body).getByRole("dialog", {
      name: "Microphone settings",
    });
    await expect(within(dialog).getByRole("combobox", { name: "Input microphone" })).toBeVisible();
    await expect(within(dialog).getByText("Voice is paused")).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  },
};
export const MicrophoneDisconnected: Story = {
  ...MicrophoneSelection,
  name: "選択マイクが切断しても履歴と設定の変更を維持する",
  args: {
    ...MicrophoneSelection.args,
    lines: Paused.args?.lines,
    view: {
      status: "paused",
      microphone: { devices: [], selectedId: "external", error: "disconnected" },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "選択したマイクが使用できなくなりました",
    );
    await expect(canvas.getByText("この日本酒は温かくできますか？")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "マイク設定" }));
    const dialog = within(canvasElement.ownerDocument.body).getByRole("dialog", {
      name: "マイク設定",
    });
    await expect(within(dialog).getByRole("combobox")).toHaveTextContent(
      "選択したマイク（未接続）",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "閉じる" }));
  },
};
export const MicrophonePermission: Story = {
  ...MicrophoneSelection,
  name: "マイク許可拒否の復旧案内",
  args: {
    ...MicrophoneSelection.args,
    view: {
      status: "paused",
      microphone: {
        devices: [],
        selectedId: "default",
        error: "permission",
        permissionRequired: true,
      },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("alert")).toHaveTextContent(
      "ブラウザーのサイト設定で許可",
    );
  },
};
export const MicrophoneNarrow: Story = {
  ...MicrophoneSelection,
  name: "狭い画面で速度スライダー右のマイク設定を操作",
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
};
