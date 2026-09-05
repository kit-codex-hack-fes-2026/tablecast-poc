import type { Catalog, Product, TableState } from "@tablecast/api/schema";

const text = (ja: string, en: string) => ({
  ja: {
    displayName: ja,
    speechName: ja,
    description: "合成データによる表示確認用です。",
    aliases: [],
  },
  en: {
    displayName: en,
    speechName: en,
    description: "Synthetic content for interface testing.",
    aliases: [],
  },
});
export const product: Product = {
  id: "tablecast-sake",
  categoryId: "tablecast-sake-category",
  text: text(
    "こもれび 月凪 純米吟醸",
    "Komorebi Tsukinagi, a fragrant and gently dry junmai ginjo sake",
  ),
  price: 650,
  available: true,
  tags: [],
  imageKey: null,
  imageKind: "illustration",
  modifiers: [
    {
      id: "tablecast-serving",
      text: text("容量", "Serving size"),
      kind: "single",
      min: 1,
      max: 1,
      options: [
        {
          id: "tablecast-glass",
          text: text("60 mL", "60 mL"),
          priceDelta: 0,
          available: true,
          maxQuantity: 1,
          requires: [],
          excludes: [],
        },
        {
          id: "tablecast-large-glass",
          text: text("90 mL", "90 mL"),
          priceDelta: 100,
          available: true,
          maxQuantity: 1,
          requires: [],
          excludes: [],
        },
      ],
    },
  ],
  allergens: {
    contains: [],
    evidence: "unknown",
    crossContact: "unknown",
    vegan: "unknown",
    note: { ja: "共用の調理器具を使用します。", en: "Prepared using shared equipment." },
  },
};
export const catalog: Catalog = {
  storeId: "tablecast-story",
  storeName: "こもれび",
  version: 1,
  configuration: {
    categories: [{ id: "tablecast-sake-category", text: text("日本酒", "Sake") }],
    products: [
      product,
      {
        ...product,
        id: "tablecast-sold-out",
        available: false,
        text: text("こもれび 白霞 にごり酒", "Komorebi Shiragasumi cloudy sake"),
      },
    ],
    plans: [],
    cast: { instructions: { ja: "", en: "" }, voice: { ja: "test", en: "test" }, proactive: false },
  },
};
export const table: TableState = {
  id: "tablecast-session",
  tableId: "tablecast-table",
  tableName: "T03",
  storeId: "tablecast-story",
  storeName: "こもれび",
  locale: "ja",
  status: "open",
  voiceState: "stopped",
  voiceSessionId: null,
  guestCount: 2,
  cart: {
    version: 1,
    total: 750,
    complete: true,
    lines: [
      {
        id: "tablecast-line",
        productId: product.id,
        quantity: 1,
        selections: [{ optionId: "tablecast-large-glass", quantity: 1 }],
        name: { ja: "こもれび 月凪 純米吟醸", en: "Komorebi Tsukinagi junmai ginjo" },
        speechName: { ja: "こもれび 月凪 純米吟醸", en: "Komorebi Tsukinagi junmai ginjo" },
        options: [
          {
            id: "tablecast-large-glass",
            name: { ja: "90 mL", en: "90 mL" },
            speechName: { ja: "90 mL", en: "90 mL" },
            quantity: 1,
            priceDelta: 100,
          },
        ],
        unitPrice: 750,
        total: 750,
        missing: [],
        planCovered: false,
      },
    ],
  },
  orders: [],
  bill: {
    orderedTotal: 1500,
    adjustmentTotal: 0,
    paidTotal: 0,
    due: 1500,
    cartTotal: 750,
    planTotal: 0,
  },
  events: [
    {
      cursor: 1,
      storeId: "tablecast-story",
      tableSessionId: "tablecast-session",
      kind: "session.opened",
      data: {},
      createdAt: 1788645000000,
    },
    {
      cursor: 2,
      storeId: "tablecast-story",
      tableSessionId: "tablecast-session",
      kind: "staff.called",
      data: {},
      createdAt: 1788645100000,
    },
  ],
  cursor: 2,
  plan: null,
  staffCalled: true,
  snapshot: null,
};
