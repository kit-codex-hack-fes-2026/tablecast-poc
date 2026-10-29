import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { expect, waitFor } from "storybook/test";
import { catalog } from "../../.storybook/tablecast-fixtures";
import { MembershipCard } from "./membership-card";

const artwork = catalog.configuration.branding?.banner;
if (!artwork) throw new Error("seedの店舗バナーがありません。");

const meta = {
  title: "共通表示/MembershipCard",
  component: MembershipCard,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    storeId: catalog.storeId,
    storeName: catalog.storeName,
    memberName: "山田 花子",
    joinedAt: 1782903600000,
    imageBasePath: `/api/admin/stores/${catalog.storeId}`,
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MembershipCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const 標準: Story = {};
export const グリーン: Story = {
  args: { branding: { logo: null, membershipCard: { tone: "green", imageFit: "contain" } } },
};
export const 長い店舗名: Story = {
  args: {
    storeName: "Tablecast Coffee and Seasonal Kitchen by the Riverside",
    memberName: "Alexandra Charlotte Wellington",
    branding: { logo: null, membershipCard: { tone: "violet", imageFit: "contain" } },
  },
};
export const 画像全体: Story = {
  args: {
    branding: {
      logo: null,
      membershipCard: { tone: "green", imageFit: "contain", image: artwork },
    },
  },
  play: async ({ canvasElement }) => {
    const image = canvasElement.querySelector("img");
    if (!image) throw new Error("カード画像がありません。");
    await waitFor(() => expect(image.complete && image.naturalWidth > 0).toBe(true));
    await expect(getComputedStyle(image).objectFit).toBe("contain");
    await expect(
      image.getBoundingClientRect().width / image.getBoundingClientRect().height,
    ).toBeCloseTo(2.5, 1);
  },
};
export const 画像を切り抜く: Story = {
  args: {
    branding: { logo: null, membershipCard: { tone: "amber", imageFit: "cover", image: artwork } },
  },
  play: async ({ canvasElement }) => {
    const image = canvasElement.querySelector("img");
    if (!image) throw new Error("カード画像がありません。");
    await waitFor(() => expect(image.complete && image.naturalWidth > 0).toBe(true));
    await expect(getComputedStyle(image).objectFit).toBe("cover");
    await expect(
      image.getBoundingClientRect().width / image.getBoundingClientRect().height,
    ).toBeCloseTo(2.5, 1);
  },
};
export const 英語: Story = {
  globals: { locale: "en" },
  args: {
    memberName: "Alexandra Wellington",
    branding: {
      logo: null,
      membershipCard: { tone: "violet", imageFit: "contain", image: artwork },
    },
  },
};
