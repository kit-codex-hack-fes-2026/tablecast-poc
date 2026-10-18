import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { Input } from "./input";
const meta = {
  title: "デザインシステム/部品/Input",
  component: Input,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof Input>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = {
  render: () => (
    <label htmlFor="tablecast-input-example" className="grid max-w-sm gap-2">
      店舗名
      <Input
        id="tablecast-input-example"
        autoComplete="organization"
        defaultValue="京料理こもれび"
      />
    </label>
  ),
};
export const 英語: Story = {
  render: () => (
    <label htmlFor="tablecast-input-example" className="grid max-w-sm gap-2">
      Restaurant name
      <Input
        id="tablecast-input-example"
        autoComplete="organization"
        defaultValue="Komorebi seasonal dining"
      />
    </label>
  ),
};
