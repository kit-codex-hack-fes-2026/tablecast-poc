import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { LayoutGrid, ChartColumn } from "lucide-react";
import * as Tabs from "./tabs";

const meta = {
  title: "UI/Tabs",
  component: Tabs.Root,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  render: () => (
    <Tabs.Root defaultValue="list" className="space-y-5">
      <Tabs.List aria-label="表示形式">
        <Tabs.Tab value="list">
          <LayoutGrid aria-hidden />
          一覧
        </Tabs.Tab>
        <Tabs.Tab value="timeline">
          <ChartColumn aria-hidden />
          タイムライン
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="list">一覧の内容</Tabs.Panel>
      <Tabs.Panel value="timeline">時間に沿った内容</Tabs.Panel>
    </Tabs.Root>
  ),
} satisfies Meta<typeof Tabs.Root>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = {};
export const 英語: Story = {
  render: () => (
    <Tabs.Root defaultValue="summary" className="space-y-5">
      <Tabs.List aria-label="Statistics view">
        <Tabs.Tab value="summary">
          <ChartColumn aria-hidden />
          Summary
        </Tabs.Tab>
        <Tabs.Tab value="products">
          <LayoutGrid aria-hidden />
          Products
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="summary">Summary</Tabs.Panel>
      <Tabs.Panel value="products">Products</Tabs.Panel>
    </Tabs.Root>
  ),
};
