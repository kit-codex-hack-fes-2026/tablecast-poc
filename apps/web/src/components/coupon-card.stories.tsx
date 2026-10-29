import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { expect, waitFor } from "storybook/test";
import { catalog } from "../../.storybook/tablecast-fixtures";
import { CouponCard } from "./coupon-card";

const artwork = catalog.configuration.branding?.banner;
if (!artwork) throw new Error("seedの店舗バナーがありません。");
const meta = {
  title: "共通表示/CouponCard",
  component: CouponCard,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    storeId: catalog.storeId,
    imageBasePath: `/api/admin/stores/${catalog.storeId}`,
    rules: {
      title: { ja: "ご来店の100円割引", en: "JPY 100 off your visit" },
      description: {
        ja: "お会計時にスタッフが適用します。",
        en: "Staff will apply this coupon to your bill.",
      },
      ...artwork,
      imageKey: artwork.imageKey,
      startsAt: Date.UTC(2026, 9, 1),
      endsAt: Date.UTC(2026, 10, 30),
      minimumYen: 1000,
      discountKind: "fixed",
      discountValue: 100,
      maximumYen: 100,
      trigger: "manual",
      threshold: 1,
    },
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-md">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CouponCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 横長: Story = {};
export const 縦長で全体表示: Story = {
  args: {
    rules: { ...meta.args.rules, presentation: { layout: "portrait", imageFit: "contain" } },
  },
  play: async ({ canvasElement }) => {
    const image = canvasElement.querySelector("img");
    if (!image) throw new Error("券面画像がありません。");
    await waitFor(() => expect(image.complete && image.naturalWidth > 0).toBe(true));
    await expect(getComputedStyle(image).objectFit).toBe("contain");
    const frame = image.parentElement;
    if (!frame) throw new Error("券面の枠がありません。");
    const bounds = frame.getBoundingClientRect();
    await expect(bounds.width / bounds.height).toBeCloseTo(3 / 4, 2);
  },
};
export const 英語: Story = { globals: { locale: "en" } };
export const 受け取り条件: Story = {
  args: {
    rules: {
      ...meta.args.rules,
      trigger: "exchange",
      threshold: 5,
      conditions: {
        all: [{ field: "visits", operator: "gte", value: 3 }],
        any: [
          { field: "spend", operator: "gte", value: 5000 },
          { field: "joinedAt", operator: "lte", value: Date.UTC(2026, 9, 1) },
        ],
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("region", { name: "この券を受け取る条件" })).toHaveTextContent(
      "確認済み来店数 3以上",
    );
  },
};
