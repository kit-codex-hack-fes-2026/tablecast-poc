import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { expect, within } from "storybook/test";
import { statisticsFixture } from "../../../.storybook/tablecast-fixtures";
import { StatisticsSummary } from "./statistics-summary";

const meta = {
  title: "店舗/統計の概要",
  component: StatisticsSummary,
  parameters: {
    docs: {
      description: {
        component:
          "終了済み来店の集計を表示する。営業中の卓数や速報売上には使わない。summaryは既存統計APIの値を渡し、未取得時は親でLoadingStateを表示する。detailedで調整・欠損・プラン等の内訳を追加する。",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="p-6">
        <Story />
      </div>
    ),
  ],
  args: { summary: statisticsFixture.summary, detailed: true },
} satisfies Meta<typeof StatisticsSummary>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Japanese: Story = {
  name: "日本語の詳細集計",
  play: async ({ canvasElement }) => {
    const label = within(canvasElement).getByText("正の入金記録合計");
    await expect(label.nextElementSibling).toHaveTextContent("¥61,700");
  },
};
export const English: Story = { name: "英語の詳細集計", globals: { locale: "en" } };
export const Home: Story = { name: "ホームの要約", args: { detailed: false } };
export const Missing: Story = {
  name: "明細の欠損と負の入金",
  args: {
    summary: { ...statisticsFixture.summary, incompleteSnapshots: 2, negativePayments: -500 },
  },
};
