import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { expect, within } from "storybook/test";
import { catalog, product } from "../../../.storybook/tablecast-fixtures";
import { posCatalogOptions, posSettingsOptions } from "../pos/pos-query";
import { posSeedCatalog, posSeedSettings } from "../pos/test-support/pos-seed-fixture";
import { ConfigurationChanges } from "./configuration-changes";

const meta = {
  title: "店舗/設定の差分",
  component: ConfigurationChanges,
  args: {
    configuration: catalog.configuration,
    changes: [
      {
        path: "products.0.price",
        before: product.price,
        after: product.price + 100,
        sensitive: true,
      },
      {
        path: "products.0.foodInfo.base.dietary.vegan.status",
        before: "unknown",
        after: "no",
        sensitive: true,
      },
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
      { path: "plans.0.productIds.0", before: null, after: product.id, sensitive: true },
      { path: "cast.instructions.en", before: "unknown", after: "Be welcoming.", sensitive: false },
      { path: "cast.proactive", before: true, after: false, sensitive: false },
      { path: "storeName", before: "TableCast", after: "麺屋 マシの頂", sensitive: false },
      {
        path: "products.0.imageSource",
        before: null,
        after: { generated: true, description: "架空の二郎系ラーメンを描いた商品イメージ" },
        sensitive: false,
      },
    ],
  },
} satisfies Meta<typeof ConfigurationChanges>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Japanese: Story = {
  name: "価格・安全情報と新規選択肢の全内容を日本語の差分で確認",
  play: async ({ canvasElement }) => {
    const rows = meta.args.changes.map((change) =>
      canvasElement.querySelector(`[data-change-path="${change.path}"]`),
    );
    await expect(rows).toHaveLength(8);
    await expect(rows[0]).toHaveTextContent("単価（税込・円）");
    await expect(rows[0]).toHaveTextContent(`¥${product.price + 100}`);
    await expect(rows[1]).toHaveTextContent("未確認");
    await expect(rows[1]).not.toHaveTextContent("unknown");
    await expect(rows[2]).toHaveTextContent("小盛");
    await expect(rows[2]).toHaveTextContent("Small");
    await expect(rows[2]).toHaveTextContent("¥100");
    await expect(rows[3]).toHaveTextContent("こもれび 月凪 純米吟醸");
    await expect(rows[4]).toHaveTextContent("unknown");
    await expect(rows[5]).toHaveTextContent("無効");
    await expect(rows[6]).toHaveTextContent("店舗名");
    await expect(rows[6]).toHaveTextContent("麺屋 マシの頂");
    await expect(rows[7]).toHaveTextContent("画像の出所");
    await expect(rows[7]).toHaveTextContent("生成画像");
  },
};
export const English: Story = {
  name: "英語の安全情報・参照名を表示し店舗の原文は保持",
  tags: ["!test"],
  globals: { locale: "en" },
  play: async ({ canvasElement }) => {
    const rows = meta.args.changes.map((change) =>
      canvasElement.querySelector(`[data-change-path="${change.path}"]`),
    );
    await expect(rows[0]).toHaveTextContent("Unit price (JPY, including tax)");
    await expect(rows[1]).toHaveTextContent("Vegan suitability");
    await expect(rows[1]).toHaveTextContent("Unconfirmed");
    await expect(rows[1]).toHaveTextContent("Not suitable");
    await expect(rows[2]).toHaveTextContent("Price adjustment (JPY, including tax)");
    await expect(rows[3]).toHaveTextContent("Komorebi Tsukinagi");
    await expect(rows[4]).toHaveTextContent("unknown");
    await expect(rows[5]).toHaveTextContent("Disabled");
    await expect(rows[6]).toHaveTextContent("Restaurant name");
    await expect(rows[7]).toHaveTextContent("Image source");
    await expect(rows[7]).toHaveTextContent("Generated image");
  },
};

const mappedProduct = posSeedSettings.products.find((item) => item.options.length);
const mappedOption = mappedProduct?.options[0];
const originalProduct = posSeedCatalog.items.find(
  (item) => item.id === `square-${mappedProduct?.id}`,
);
const originalOption = originalProduct?.options.find(
  (item) => item.id === `square-${mappedOption?.id}`,
);
if (!mappedProduct || !mappedOption || !originalProduct || !originalOption)
  throw new Error("商品とカスタマイズの差分fixtureがありません");
const original = { product: originalProduct, option: originalOption };
const posChange = {
  path: "pos",
  before: {
    provider: "square",
    connectionId: "tablecast-pos-connection",
    mappings: [
      { kind: "product", localId: mappedProduct.id, externalId: originalProduct.id },
      { kind: "option", localId: mappedOption.id, externalId: originalOption.id },
    ],
  },
  after: {
    provider: "square",
    connectionId: "tablecast-pos-connection",
    mappings: [
      { kind: "product", localId: mappedProduct.id, externalId: "tablecast-square-product-next" },
      { kind: "option", localId: mappedOption.id, externalId: "tablecast-square-option-next" },
    ],
  },
  sensitive: true,
};

function createPosDiffClient() {
  const next = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  next.setQueryData(posSettingsOptions("tablecast-store").queryKey, posSeedSettings);
  next.setQueryData(posCatalogOptions("tablecast-store", "tablecast-location").queryKey, {
    ...posSeedCatalog,
    items: [
      ...posSeedCatalog.items,
      {
        ...original.product,
        id: "tablecast-square-product-next",
        name: "変更先の商品（店内）",
        options: [
          {
            ...original.option,
            id: "tablecast-square-option-next",
            name: "変更先のカスタマイズ",
          },
        ],
      },
    ],
  });
  return next;
}

export const PosMapping: Story = {
  name: "商品・カスタマイズのSquare対応前後を原文名で確認",
  args: { storeId: "tablecast-store", changes: [posChange] },
  decorators: [
    function WithQueries(Story) {
      const [client] = useState(createPosDiffClient);
      useEffect(() => () => client.clear(), [client]);
      return (
        <QueryClientProvider client={client}>
          <Story />
        </QueryClientProvider>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const row = canvas.getByRole("row", {
      name: new RegExp(`商品対応 · ${mappedProduct.name.ja}`),
    });
    await expect(row).toHaveTextContent(originalProduct.name);
    await expect(row).toHaveTextContent("変更先の商品（店内）");
    const option = canvas.getByRole("row", {
      name: new RegExp(`カスタマイズ対応 · ${mappedOption.name.ja}`),
    });
    await expect(option).toHaveTextContent(mappedOption.name.ja);
    await expect(option).toHaveTextContent(originalOption.name);
    await expect(option).toHaveTextContent("変更先のカスタマイズ");
    await expect(canvas.queryByText("tablecast-square-product-next")).not.toBeInTheDocument();
  },
};

export const PosMappingEnglish: Story = {
  ...PosMapping,
  name: "英語の差分でもSquare登録名は原文を保持",
  globals: { locale: "en" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("columnheader", { name: "Before" })).toBeVisible();
    await expect(canvas.getByRole("columnheader", { name: "After" })).toBeVisible();
    await expect(canvas.getByText("変更先の商品（店内）", { exact: true })).toBeVisible();
    await expect(canvas.getByText("変更先のカスタマイズ", { exact: true })).toBeVisible();
  },
};
