import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { expect, fn, waitFor } from "storybook/test";
import { catalog, catalogs } from "../../.storybook/tablecast-fixtures";
import { ProductMenu } from "./product-menu";
const meta = {
  title: "共通表示/ProductMenu",
  component: ProductMenu,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: { catalog, onChoose: fn() },
} satisfies Meta<typeof ProductMenu>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = {
  play: async ({ canvasElement }) => {
    const image = canvasElement.querySelector('img[src*="/images/tablecast/"]');
    if (!(image instanceof HTMLImageElement)) throw new Error("seedの商品画像がありません。");
    await waitFor(async () => {
      await image.decode();
      await expect(image.naturalWidth).toBeGreaterThan(0);
    });
  },
};
export const 英語: Story = { ...標準, globals: { locale: "en" } };
export const 簡体字中国語: Story = { ...標準, globals: { locale: "zh-Hans" } };
export const 韓国語: Story = { ...標準, globals: { locale: "ko" } };
const korean = catalogs.find((item) => item.storeId === "tablecast-hanul");
const burgers = catalogs.find((item) => item.storeId === "tablecast-koharu");
if (!korean || !burgers) throw new Error("seedの店舗がありません。");
export const 韓国料理: Story = { ...標準, args: { catalog: korean } };
export const バーガー: Story = { ...標準, args: { catalog: burgers } };
