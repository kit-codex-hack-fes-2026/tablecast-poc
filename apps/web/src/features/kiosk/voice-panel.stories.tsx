import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
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
  args: { view: { status: "idle" }, lines: [], onStart: fn() },
} satisfies Meta<typeof VoicePanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Welcome: Story = {
  name: "日本語の初回表示",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "音声を開始" }));
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
        text: "はい。温度の選択肢から熱燗を選べます。容量も合わせてお選びください。",
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
