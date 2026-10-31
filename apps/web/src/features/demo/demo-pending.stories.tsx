import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { DemoPending } from "./demo-pending";

const meta = {
  title: "店舗/デモの読込中",
  component: DemoPending,
  args: { device: "ipad", portrait: false },
} satisfies Meta<typeof DemoPending>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Landscape: Story = { name: "iPad横向き" };
export const Portrait: Story = { name: "iPad縦向き", args: { portrait: true } };
export const Browser: Story = { name: "ブラウザー全体", args: { device: "browser" } };
export const Mobile: Story = {
  name: "狭い画面の操作バー",
  globals: { viewport: { value: "iphone17" } },
};
export const English: Story = { name: "英語の操作バー", globals: { locale: "en" } };
