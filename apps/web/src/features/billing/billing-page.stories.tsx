import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, within } from "storybook/test";
import { BillingOverview } from "./billing-page";
import { billingFixture } from "./billing-fixture";
const meta = {
  title: "管理/課金と請求",
  component: BillingOverview,
  args: { data: billingFixture },
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient()}>
        <div className="space-y-6 p-6">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof BillingOverview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Owner: Story = {
  name: "契約中のowner",
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("現在のプラン")).toBeVisible();
  },
};
export const Member: Story = {
  name: "memberの利用状況",
  args: {
    data: {
      ...billingFixture,
      canManage: false,
      daily: billingFixture.daily.map(({ day, seconds }) => ({ day, seconds })),
      financial: null,
    },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText("現在のプラン")).not.toBeInTheDocument();
  },
};
export const Preparing: Story = {
  name: "AI準備中",
  args: { data: { ...billingFixture, usage: { ...billingFixture.usage, aiState: "pending" } } },
};
export const Failed: Story = {
  name: "AI準備失敗と未契約",
  args: {
    data: {
      ...billingFixture,
      usage: { ...billingFixture.usage, aiState: "failed" },
      financial: {
        ...billingFixture.financial,
        subscription: null,
        currentCycle: null,
        checkoutRequired: true,
      },
    },
  },
};
export const English: Story = {
  name: "英語",
  globals: { locale: "en" },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("heading", { name: "Standard", level: 2 }),
    ).toBeVisible();
  },
};
export const Free: Story = {
  name: "無料プランと有料プランの比較",
  args: {
    data: {
      ...billingFixture,
      usage: { ...billingFixture.usage, seconds: 0, responses: 0 },
      daily: billingFixture.daily.map(({ day }) => ({ day, seconds: 0, chargeMicros: 0 })),
      financial: {
        ...billingFixture.financial,
        subscription: null,
        currentCycle: null,
        checkoutRequired: true,
      },
    },
  },
};
export const CancellationScheduled: Story = {
  name: "期間末に無料へ変更予定",
  args: {
    data: {
      ...billingFixture,
      financial: {
        ...billingFixture.financial,
        subscription: { ...billingFixture.financial.subscription, cancelAtPeriodEnd: true },
      },
    },
  },
};
