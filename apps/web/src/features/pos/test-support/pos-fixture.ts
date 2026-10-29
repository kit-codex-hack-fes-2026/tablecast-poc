import type { PosCatalog, PosCheckoutView, PosSettings } from "@tablecast/api/schema";

export const posSettingsFixture: PosSettings = {
  configured: true,
  connection: {
    id: "tablecast-pos-connection",
    provider: "square",
    mode: "live",
    status: "connected",
    merchantId: "tablecast-merchant",
    locationId: "tablecast-location",
    deviceId: "tablecast-terminal-1",
    revision: 2,
    updatedAt: 1_792_800_000_000,
  },
  capabilities: { catalog: true, quote: true, orderExport: true, checkout: true, cancel: true },
  mappingConnectionId: "tablecast-pos-connection",
  publishedVersion: 3,
  draft: { id: "tablecast-pos-draft", version: 4, baseVersion: 3, status: "draft" },
  legacyMappings: null,
  mappings: [{ kind: "product", localId: "tablecast-tea", externalId: "tablecast-square-tea" }],
  products: [
    {
      id: "tablecast-tea",
      name: { ja: "煎茶", en: "Green tea" },
      price: 500,
      available: true,
      imageKey: null,
      imageKind: "photograph",
      options: [
        {
          id: "tablecast-large",
          name: { ja: "大きめ", en: "Large" },
          price: 100,
          imageKey: null,
          imageKind: "photograph",
        },
      ],
    },
  ],
  devices: [],
};
export const posCatalogFixture: PosCatalog = {
  locations: [{ id: "tablecast-location", name: "京都店" }],
  items: [
    {
      id: "tablecast-square-tea",
      name: "煎茶（店内）",
      price: 500,
      available: true,
      options: [{ id: "tablecast-square-large", name: "大盛り", price: 100, available: true }],
    },
  ],
  issues: [],
};

const mappingProduct = posSettingsFixture.products[0];
const mappingItem = posCatalogFixture.items[0];
if (!mappingProduct || !mappingItem) throw new Error("対応付け用の商品fixtureがありません");

export const posMappingSettingsFixture: PosSettings = {
  ...posSettingsFixture,
  products: [
    {
      ...mappingProduct,
      options: [
        ...mappingProduct.options,
        {
          id: "tablecast-extra",
          name: { ja: "特大", en: "Extra large" },
          price: 100,
          imageKey: null,
          imageKind: "photograph",
        },
        {
          id: "tablecast-shared",
          name: { ja: "共通の選択肢", en: "Shared customisation" },
          price: 0,
          imageKey: null,
          imageKind: "photograph",
        },
      ],
    },
    {
      ...mappingProduct,
      id: "tablecast-coffee",
      name: { ja: "コーヒー", en: "Coffee" },
      options: [
        {
          id: "tablecast-shared",
          name: { ja: "共通の選択肢", en: "Shared customisation" },
          price: 0,
          imageKey: null,
          imageKind: "photograph",
        },
      ],
    },
    {
      ...mappingProduct,
      id: "tablecast-juice",
      name: { ja: "ジュース", en: "Juice" },
      price: 400,
      options: [
        {
          id: "tablecast-ice",
          name: { ja: "氷", en: "Ice" },
          price: 0,
          imageKey: null,
          imageKind: "photograph",
        },
      ],
    },
    {
      ...mappingProduct,
      id: "tablecast-cake",
      name: { ja: "ケーキ", en: "Cake" },
      price: 600,
      options: [],
    },
  ],
  mappings: [
    { kind: "product", localId: "tablecast-tea", externalId: "tablecast-square-tea" },
    { kind: "product", localId: "tablecast-coffee", externalId: "tablecast-square-tea" },
    { kind: "product", localId: "tablecast-juice", externalId: "tablecast-square-juice" },
    { kind: "option", localId: "tablecast-large", externalId: "tablecast-square-large" },
    { kind: "option", localId: "tablecast-extra", externalId: "tablecast-square-large" },
    { kind: "option", localId: "tablecast-shared", externalId: "tablecast-square-shared" },
    { kind: "option", localId: "tablecast-ice", externalId: "tablecast-square-removed" },
  ],
};

export const posMappingCatalogFixture: PosCatalog = {
  ...posCatalogFixture,
  items: [
    {
      ...mappingItem,
      options: [
        ...mappingItem.options,
        { id: "tablecast-square-extra", name: "特大", price: 100, available: true },
        { id: "tablecast-square-shared", name: "共通カスタマイズ", price: 0, available: true },
        {
          id: "tablecast-square-shared-next",
          name: "共通カスタマイズ（変更後）",
          price: 0,
          available: true,
        },
      ],
    },
    {
      id: "tablecast-square-coffee",
      name: "ホットコーヒー",
      price: 500,
      available: true,
      options: [
        { id: "tablecast-square-shared", name: "共通カスタマイズ", price: 0, available: true },
        {
          id: "tablecast-square-shared-next",
          name: "共通カスタマイズ（変更後）",
          price: 0,
          available: true,
        },
      ],
    },
    {
      id: "tablecast-square-juice",
      name: "オレンジジュース",
      price: 400,
      available: true,
      options: [{ id: "tablecast-square-ice", name: "氷あり", price: 0, available: true }],
    },
    {
      id: "tablecast-square-cake",
      name: "本日のケーキ",
      price: 600,
      available: true,
      options: [],
    },
  ],
};
export const posCheckoutFixture: PosCheckoutView = {
  connection: posSettingsFixture.connection,
  checkout: null,
  invoice: {
    id: "tablecast-invoice",
    storeId: "tablecast-store",
    sessionId: "tablecast-session",
    version: 7,
    currency: "JPY",
    total: 600,
    lines: [
      {
        id: "tablecast-line",
        productId: "tablecast-tea",
        externalId: "tablecast-square-tea",
        name: "煎茶 / Green tea",
        quantity: 1,
        unitPrice: 500,
        referencePrice: 500,
        total: 600,
        options: [
          {
            id: "tablecast-large",
            externalId: "tablecast-square-large",
            name: "大きめ / Large",
            quantity: 1,
            price: 100,
            referencePrice: 100,
          },
        ],
      },
    ],
    adjustments: [],
  },
  issues: [],
  locked: false,
  canStart: true,
  canCancel: false,
  canReconcile: false,
};

export const posDevicesFixture = {
  devices: [
    { id: "tablecast-terminal-1", name: "レジ1", locationId: "tablecast-location" },
    { id: "tablecast-terminal-2", name: "レジ2", locationId: "tablecast-location" },
  ],
  canPair: true,
};
