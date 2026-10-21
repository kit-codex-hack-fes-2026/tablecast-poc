import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { Plus } from "lucide-react";
import { useState } from "react";
import { fn } from "storybook/test";
import { catalog, table } from "../../.storybook/tablecast-fixtures";
import { useI18n } from "../i18n/locale";
import { CartLines } from "./cart-lines";
import { Button } from "./ui/button";
const meta = {
  title: "共通表示/CartLines",
  component: CartLines,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: {
    lines: table.cart.lines,
    products: catalog.configuration.products,
    onEdit: fn(),
    onRemove: fn(),
    onQuantity: fn(),
  },
} satisfies Meta<typeof CartLines>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = {};
export const 空: Story = { args: { lines: [] } };
export const 表示のみ: Story = {
  args: { onEdit: undefined, onRemove: undefined, onQuantity: undefined },
};
export const 英語: Story = { globals: { locale: "en" } };

function CartPresenceExample() {
  const { locale } = useI18n();
  const [lines, setLines] = useState(table.cart.lines);
  return (
    <div className="max-w-xl space-y-4">
      <Button
        variant="outline"
        onClick={() =>
          setLines((current) => [
            ...current,
            ...table.cart.lines.map((line) => ({ ...line, id: crypto.randomUUID() })),
          ])
        }
      >
        <Plus aria-hidden />
        {locale === "en" ? "Add another item" : "商品を追加"}
      </Button>
      <CartLines
        lines={lines}
        products={catalog.configuration.products}
        onRemove={(line) => setLines((current) => current.filter((item) => item.id !== line.id))}
      />
    </div>
  );
}
export const 追加と削除: Story = { render: () => <CartPresenceExample /> };
