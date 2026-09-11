import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { DemoViewport } from "./demo-viewport";
const meta = {
  title: "店舗/デモ端末枠",
  component: DemoViewport,
  decorators: [
    (Story) => (
      <div className="flex h-160">
        <Story />
      </div>
    ),
  ],
  args: { src: "about:blank", device: "ipad", portrait: false },
} satisfies Meta<typeof DemoViewport>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Landscape: Story = { name: "iPad横向き" };
export const Portrait: Story = { name: "iPad縦向き", args: { portrait: true } };
export const Browser: Story = { name: "ブラウザ全体", args: { device: "browser" } };

export const Air11: Story = { name: "iPad Air 11インチ", args: { device: "ipad-air-11" } };
export const Air13: Story = { name: "iPad Air 13インチ", args: { device: "ipad-air-13" } };
