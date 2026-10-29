import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { expect, within } from "storybook/test";
import { PosCheckoutSummary } from "./pos-checkout";
import { posSeedCheckout } from "./test-support/pos-seed-fixture";
const posCheckoutFixture = posSeedCheckout("ja");

const meta = {
  title: "管理/POS会計",
  component: PosCheckoutSummary,
  args: { data: posCheckoutFixture, expanded: true },
  decorators: [
    (Story) => (
      <main className="max-w-2xl space-y-5 p-6">
        <Story />
      </main>
    ),
  ],
} satisfies Meta<typeof PosCheckoutSummary>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Preview: Story = { name: "会計プレビュー" };
export const PriceDifference: Story = {
  name: "価格差異で開始を停止",
  args: {
    data: {
      ...posCheckoutFixture,
      canStart: false,
      issues: [
        { code: "POS_PRICE_MISMATCH", name: "煎茶 / Green tea", expected: 500, actual: 510 },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("価格が一致していません。")).toBeVisible();
  },
};
export const Pending: Story = {
  name: "支払い待ちで会計を固定",
  args: {
    data: {
      ...posCheckoutFixture,
      canStart: false,
      locked: true,
      canCancel: true,
      canReconcile: true,
      checkout: {
        id: "tablecast-checkout",
        status: "pending",
        amount: 600,
        currency: "JPY",
        updatedAt: 1_792_800_000_000,
        issue: null,
      },
    },
  },
};
export const Review: Story = {
  name: "結果不明で再照会が必要",
  args: {
    data: {
      ...posCheckoutFixture,
      canStart: false,
      locked: true,
      canReconcile: true,
      checkout: {
        id: "tablecast-checkout",
        status: "review",
        amount: 600,
        currency: "JPY",
        updatedAt: 1_792_800_000_000,
        issue: "POS_UNKNOWN_OUTCOME",
      },
    },
  },
};
export const Completed: Story = {
  name: "支払い完了",
  args: {
    data: {
      ...posCheckoutFixture,
      canStart: false,
      checkout: {
        id: "tablecast-checkout",
        status: "completed",
        amount: 600,
        currency: "JPY",
        updatedAt: 1_792_800_000_000,
        issue: null,
      },
    },
  },
};
export const English: Story = {
  ...Review,
  name: "英語の結果確認",
  globals: { locale: "en" },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("Needs checking")).toBeVisible();
  },
};
