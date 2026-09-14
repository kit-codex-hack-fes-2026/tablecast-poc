import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { expect, waitFor } from "storybook/test";
import { ProductImage } from "./product-image";
import transparent from "../../.storybook/tablecast-transparent.svg?url&no-inline";

const meta = {
  title: "共通/商品画像",
  component: ProductImage,
  args: {
    src: transparent,
    alt: "商品画像の表示例",
    width: 192,
    height: 192,
    sizes: "192px",
    priority: true,
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof ProductImage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WithoutPlaceholder: Story = { name: "placeholder未指定" };

export const InlinePlaceholder: Story = {
  name: "inlineぼかし背景と透過画像",
  args: {
    blurDataURL:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Cdefs%3E%3Cfilter id='b'%3E%3CfeGaussianBlur stdDeviation='3'/%3E%3C/filter%3E%3C/defs%3E%3Crect width='24' height='24' fill='%23ece4d9'/%3E%3Ccircle cx='12' cy='12' r='7' fill='%2396704e' filter='url(%23b)'/%3E%3C/svg%3E",
  },
  play: async ({ canvasElement }) => {
    const image = canvasElement.querySelector("img");
    if (!image) throw new Error("画像がありません");
    await waitFor(() => expect(image.complete && image.naturalWidth > 0).toBe(true));
    await waitFor(() => expect(getComputedStyle(image).backgroundImage).toBe("none"));
    await expect(image.getBoundingClientRect().height).toBe(192);
  },
};

export const Failed: Story = {
  name: "読込失敗でも枠を維持",
  args: { ...InlinePlaceholder.args, src: "/tablecast-missing-image.png" },
  play: async ({ canvasElement }) => {
    const image = canvasElement.querySelector("img");
    if (!image) throw new Error("画像がありません");
    await waitFor(() => expect(image.complete).toBe(true));
    await waitFor(() => expect(getComputedStyle(image).backgroundImage).toBe("none"));
    await expect(image.getBoundingClientRect().height).toBe(192);
  },
};
