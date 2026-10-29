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
      name: "Green tea",
      price: 500,
      available: true,
      options: [{ id: "tablecast-square-large", name: "Large", price: 100, available: true }],
    },
  ],
  issues: [],
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
