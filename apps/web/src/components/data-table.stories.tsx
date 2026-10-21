import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { DataTable } from "./data-table";
const meta = {
  title: "共通表示/DataTable",
  component: DataTable<{ id: string; name: string; count: number }>,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: {
    data: [
      { id: "tea", name: "ほうじ茶", count: 3 },
      { id: "rice", name: "季節の御膳", count: 2 },
    ],
    columns: [
      { accessorKey: "name", header: "商品" },
      { accessorKey: "count", header: "数量" },
    ],
    getRowId: (row) => row.id,
    searchLabel: "商品を検索",
  },
} satisfies Meta<typeof DataTable<{ id: string; name: string; count: number }>>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = {};
export const 空: Story = { args: { data: [] } };
export const 読込中: Story = { args: { data: [], pending: true } };
export const 英語: Story = {
  globals: { locale: "en" },
  args: {
    searchLabel: "Search products",
    columns: [
      { accessorKey: "name", header: "Product" },
      { accessorKey: "count", header: "Quantity" },
    ],
  },
};
