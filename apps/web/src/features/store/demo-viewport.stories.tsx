import type { Meta, StoryObj } from "@storybook/react-vite";
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
  args: { src: "about:blank", tablet: true, portrait: false },
} satisfies Meta<typeof DemoViewport>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Landscape: Story = { name: "iPad横向き" };
export const Portrait: Story = { name: "iPad縦向き", args: { portrait: true } };
export const Browser: Story = { name: "ブラウザ全体", args: { tablet: false } };
