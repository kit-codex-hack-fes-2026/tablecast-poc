import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { expect, fn, userEvent, within } from "storybook/test";
import { catalog } from "../../../.storybook/tablecast-fixtures";
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

export const GuidedOrdering: Story = {
  name: "iPadの既定幅で商品と次の発話候補を見ながら会話する",
  render: (args) => (
    <div className="h-173 w-60">
      <VoicePanel {...args} />
    </div>
  ),
  args: {
    catalog,
    onChoose: fn(),
    onMicrophoneChange: fn(),
    onMicrophoneRefresh: fn(),
    events: [
      {
        cursor: 1,
        storeId: catalog.storeId,
        tableSessionId: "tablecast-session",
        createdAt: 1788645000200,
        kind: "voice.products",
        data: {
          turnId: "tablecast-guidance",
          productIds: catalog.configuration.products
            .filter((product) => product.available)
            .map((product) => product.id)
            .slice(0, 4),
        },
      },
    ],
    view: {
      status: "listening",
      suggestions: [
        "おすすめの料理を教えて",
        "温かいお酒はありますか？",
        "アレルギーについて相談したい",
      ],
    },
    lines: [
      {
        id: "tablecast-current-question",
        role: "assistant",
        locale: "ja",
        text: "気になる商品を教えてください。特徴や選び方をご案内します。",
        createdAt: 1788645001000,
        interrupted: false,
      },
    ],
    onSuggestion: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("気になる商品を教えてください。特徴や選び方をご案内します。"),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "温かいお酒はありますか？" }));
    await expect(args.onSuggestion).toHaveBeenCalledWith(
      "温かいお酒はありますか？",
      args.view.suggestions,
    );
  },
};
export const GuidedOrderingEnglish: Story = {
  ...GuidedOrdering,
  name: "英語のiPad既定幅で商品と発話候補を表示",
  globals: { locale: "en" },
  args: {
    ...GuidedOrdering.args,
    view: {
      status: "listening",
      suggestions: ["What do you recommend?", "Can the sake be served warm?", "I have an allergy"],
    },
    lines: [
      {
        id: "tablecast-current-question",
        role: "assistant",
        locale: "en",
        text: "Which item interests you? I can explain the options and help you choose.",
        createdAt: 1788645001000,
        interrupted: false,
      },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("Which item interests you? I can explain the options and help you choose."),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Can the sake be served warm?" }));
    await expect(args.onSuggestion).toHaveBeenCalledWith(
      "Can the sake be served warm?",
      args.view.suggestions,
    );
  },
};
