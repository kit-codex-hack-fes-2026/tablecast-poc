import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { VoicePanel } from "./voice-panel";
import { catalog, product } from "../../../.storybook/tablecast-fixtures";

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
  args: { view: { status: "idle" }, lines: [], onStart: fn() },
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
    const visual = canvasElement.querySelector("figure[data-voice-state=speaking]");
    await expect(visual).toBeVisible();
    await expect(canvas.getByText("ツール実行中", { exact: true })).toBeVisible();
  },
};
export const PausedWithStaleTool: Story = {
  ...ToolAndCards,
  name: "停止後に古いツールを実行中と表示しない",
  args: { ...ToolAndCards.args, view: { status: "paused" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvasElement.querySelector("figure[data-voice-state=paused][data-motion=still]"),
    ).toBeVisible();
    await expect(canvas.queryByText("ツール実行中", { exact: true })).not.toBeInTheDocument();
    await expect(canvas.getByText("中断", { exact: true })).toBeVisible();
  },
};
