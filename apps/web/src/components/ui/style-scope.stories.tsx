import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { StyleScopeBoundary, StyleScopeProvider } from "./style-scope";
const meta = {
  title: "デザインシステム/部品/StyleScopeBoundary",
  component: StyleScopeBoundary,
  subcomponents: { StyleScopeProvider },
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: { children: "標準テーマ" },
} satisfies Meta<typeof StyleScopeBoundary>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = {
  render: () => (
    <StyleScopeProvider value={null}>
      <StyleScopeBoundary>
        <p>標準テーマでは子要素をそのまま表示します。</p>
      </StyleScopeBoundary>
    </StyleScopeProvider>
  ),
};
