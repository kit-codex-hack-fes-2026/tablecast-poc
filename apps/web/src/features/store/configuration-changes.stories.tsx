import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { catalog } from "../../../.storybook/tablecast-fixtures";
import { ConfigurationChanges } from "./configuration-changes";

const meta = {
  title: "店舗/設定の差分",
  component: ConfigurationChanges,
  args: {
    configuration: catalog.configuration,
    changes: [
      { path: "products.0.price", before: 650, after: 750, sensitive: true },
      { path: "products.0.allergens.vegan", before: "unknown", after: "no", sensitive: true },
      {
        path: "products.0.modifiers.0.options.0",
        before: null,
        after: {
          priceDelta: 100,
          available: false,
          text: { ja: { displayName: "小盛" }, en: { displayName: "Small" } },
        },
        sensitive: true,
      },
      { path: "plans.0.productIds.0", before: null, after: "tablecast-sake", sensitive: true },
      { path: "cast.instructions.en", before: "unknown", after: "Be welcoming.", sensitive: false },
      { path: "cast.proactive", before: true, after: false, sensitive: false },
    ],
  },
} satisfies Meta<typeof ConfigurationChanges>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Japanese: Story = {
  name: "価格・安全情報と新規選択肢の全内容を日本語の差分で確認",
  play: async ({ canvasElement }) => {
    const rows = canvasElement.querySelectorAll("[data-ui='config-change']");
    await expect(rows).toHaveLength(6);
    await expect(rows[0]).toHaveTextContent("単価（税込・円）");
    await expect(rows[0]).toHaveTextContent("¥750");
    await expect(rows[1]).toHaveTextContent("未確認");
    await expect(rows[1]).not.toHaveTextContent("unknown");
    await expect(rows[2]).toHaveTextContent("小盛");
    await expect(rows[2]).toHaveTextContent("Small");
    await expect(rows[2]).toHaveTextContent("¥100");
    await expect(rows[3]).toHaveTextContent("こもれび 月凪 純米吟醸");
    await expect(rows[4]).toHaveTextContent("unknown");
    await expect(rows[5]).toHaveTextContent("無効");
  },
};
export const English: Story = {
  name: "英語の安全情報・参照名を表示し店舗の原文は保持",
  globals: { locale: "en" },
  play: async ({ canvasElement }) => {
    const rows = canvasElement.querySelectorAll("[data-ui='config-change']");
    await expect(rows[0]).toHaveTextContent("Unit price (JPY, including tax)");
    await expect(rows[1]).toHaveTextContent("Vegan suitability");
    await expect(rows[1]).toHaveTextContent("Unconfirmed");
    await expect(rows[1]).toHaveTextContent("Not suitable");
    await expect(rows[2]).toHaveTextContent("Price adjustment (JPY, including tax)");
    await expect(rows[3]).toHaveTextContent("Komorebi Tsukinagi");
    await expect(rows[4]).toHaveTextContent("unknown");
    await expect(rows[5]).toHaveTextContent("Disabled");
  },
};
