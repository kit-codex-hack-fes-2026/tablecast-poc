import type { Meta, StoryObj } from "@storybook/tanstack-react";
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

export const ReplySuggestions: Story = {
  name: "日本語の開始案内と発話候補",
  args: {
    view: {
      status: "listening",
      suggestions: ["お茶の種類を教えてください", "料理のおすすめはありますか？", "今は大丈夫です"],
    },
    onSuggestion: fn(),
    lines: [
      {
        id: "tablecast-opening",
        role: "assistant",
        text: "いらっしゃいませ。お茶や料理のおすすめをご案内しましょうか？",
        locale: "ja",
        createdAt: 1788645000000,
        interrupted: false,
      },
    ],
  },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "お茶の種類を教えてください" }),
    );
    await expect(args.onSuggestion).toHaveBeenCalledOnce();
    await expect(within(canvasElement).queryByRole("textbox")).not.toBeInTheDocument();
  },
};
export const EnglishReplySuggestions: Story = {
  name: "英語の開始案内と発話候補",
  globals: { locale: "en" },
  args: {
    view: {
      status: "listening",
      suggestions: [
        "Which teas do you serve?",
        "What food would you recommend?",
        "That is all, thank you.",
      ],
    },
    onSuggestion: fn(),
    lines: [
      {
        id: "tablecast-opening-en",
        role: "assistant",
        text: "Welcome. Would you like a recommendation for tea or food?",
        locale: "en",
        createdAt: 1788645000000,
        interrupted: false,
      },
    ],
  },
};
