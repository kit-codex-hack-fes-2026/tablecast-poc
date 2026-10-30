import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { KioskPending } from "./kiosk-pending";

const meta = {
  title: "客向け/注文画面の読込中",
  component: KioskPending,
  decorators: [
    (Story) => (
      <div className="h-dvh">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof KioskPending>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Landscape: Story = { name: "iPad横向き", globals: { viewport: { value: "ipad11" } } };
export const Portrait: Story = {
  name: "iPad縦向き",
  parameters: {
    viewport: {
      options: {
        ipadPortrait: {
          name: "iPad縦向き",
          styles: { width: "820px", height: "1180px" },
          type: "tablet",
        },
      },
    },
  },
  globals: { viewport: { value: "ipadPortrait" } },
};
export const Mobile: Story = {
  name: "スマートフォン",
  globals: { viewport: { value: "iphone17" } },
};
export const Desktop: Story = {
  name: "ブラウザー全体",
  globals: { viewport: { value: "macbook14" } },
};
export const English: Story = { name: "英語", globals: { locale: "en" } };
