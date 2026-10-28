import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { expect, fn, waitFor, within } from "storybook/test";
import { VoicePanel } from "./voice-panel";

const meta = {
  title: "客向け/応答待ち",
  component: VoicePanel,
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(canvasElement.querySelector('[data-ui="reasoning"]')).toHaveStyle({ opacity: "1" }),
    );
  },
  decorators: [
    (Story) => (
      <div className="h-173 w-60">
        <Story />
      </div>
    ),
  ],
  args: {
    lines: [],
    onStart: fn(),
    onMicrophoneChange: fn(),
    onMicrophoneRefresh: fn(),
    view: {
      status: "thinking",
      progress: {
        stage: "searching",
        summary:
          "**お茶の淹れ方**を調べています。\n\n- 公開資料の出典を確認\n- 店舗の価格はメニュー情報で確認\n\n| 温度 | 蒸らす時間 |\n| --- | --- |\n| 80°C | 2分 |",
      },
    },
    events: [
      {
        cursor: 1,
        storeId: "tablecast-store",
        tableSessionId: "tablecast-session",
        createdAt: 1788645000000,
        kind: "voice.tool",
        data: {
          turnId: "tablecast-turn",
          toolCallId: "tablecast-search",
          toolName: "getCatalog",
          state: "running",
          query: "お茶 淹れ方 温度",
        },
      },
    ],
  },
} satisfies Meta<typeof VoicePanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Searching: Story = {
  name: "iPadの240px幅で推論要約とツールを常時表示",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvasElement.querySelector('[data-ui="reasoning"]')).toHaveStyle({ opacity: "1" }),
    );
    await expect(canvas.getByText("お茶の淹れ方", { exact: true })).toBeVisible();
    await expect(canvas.getByRole("table")).toBeVisible();
    await expect(canvas.getByText("実行中", { exact: true })).toBeVisible();
    await waitFor(() =>
      expect(canvasElement.querySelector('[data-ui="reasoning"]')).toHaveStyle({ opacity: "1" }),
    );
  },
};
export const English: Story = {
  name: "英語の推論要約とツールを常時表示",
  globals: { locale: "en" },
  args: {
    view: {
      status: "thinking",
      progress: {
        stage: "searching",
        summary:
          "**Preparing tea**\n\n- Check the sources\n- Check prices against the restaurant menu\n\n| Temperature | Time |\n| --- | --- |\n| 80°C | 2 minutes |",
      },
    },
  },
};
