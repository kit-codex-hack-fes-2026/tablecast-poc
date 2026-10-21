import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "./resizable";
const meta = {
  title: "デザインシステム/部品/ResizablePanelGroup",
  component: ResizablePanelGroup,
  subcomponents: { ResizablePanel, ResizableHandle },
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof ResizablePanelGroup>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = {
  render: () => (
    <ResizablePanelGroup orientation="horizontal" className="h-64">
      <ResizablePanel defaultSize="40%" minSize="25%">
        <section className="p-4">会話</section>
      </ResizablePanel>
      <ResizableHandle aria-label="会話とメニューの幅を調整" />
      <ResizablePanel defaultSize="60%" minSize="25%">
        <section className="p-4">メニュー</section>
      </ResizablePanel>
    </ResizablePanelGroup>
  ),
};
