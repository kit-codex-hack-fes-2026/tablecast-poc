import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { Table, TableCell, TableHead } from "./table";
const meta = {
  title: "デザインシステム/部品/Table",
  component: Table,
  subcomponents: { TableHead, TableCell },
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof Table>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = {
  render: () => (
    <div className="overflow-x-auto">
      <Table>
        <caption className="text-left">注文の内訳</caption>
        <thead>
          <tr>
            <TableHead scope="col">商品</TableHead>
            <TableHead scope="col">数量</TableHead>
          </tr>
        </thead>
        <tbody>
          <tr>
            <TableCell>季節の御膳</TableCell>
            <TableCell>2</TableCell>
          </tr>
        </tbody>
      </Table>
    </div>
  ),
};
