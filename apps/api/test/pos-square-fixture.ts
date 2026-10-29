import { vi } from "vitest";
import type { PosInvoice } from "../src/modules/pos/model";

type WireCall = { body: unknown; headers: Headers; method: string | undefined; url: URL };
export function transport(responses: (Error | { body: unknown; status?: number })[]) {
  const calls: WireCall[] = [];
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ url, body, method: init?.method, headers: new Headers(init?.headers) });
    const response = responses.shift();
    if (response instanceof Error) throw response;
    if (!response) throw new Error("Square応答fixtureがありません");
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });
  return { fetch: fetcher, calls };
}

export const invoice: PosInvoice = {
  id: "tablecast-invoice",
  storeId: "tablecast-store",
  sessionId: "tablecast-session",
  version: 4,
  currency: "JPY",
  total: 2400,
  lines: [
    {
      id: "paid",
      productId: "latte",
      externalId: "square-latte",
      name: "ラテ",
      quantity: 2,
      unitPrice: 1000,
      referencePrice: 1000,
      total: 2300,
      options: [
        {
          id: "extra",
          externalId: "square-extra",
          name: "追加",
          quantity: 2,
          price: 100,
          referencePrice: 100,
        },
        {
          id: "less",
          externalId: "square-less",
          name: "減量",
          quantity: 1,
          price: -50,
          referencePrice: -50,
        },
      ],
    },
    {
      id: "included",
      productId: "tea",
      externalId: "square-tea",
      name: "プラン内のお茶",
      quantity: 1,
      unitPrice: 0,
      referencePrice: 600,
      total: 0,
      options: [
        {
          id: "included-extra",
          externalId: "square-included",
          name: "プラン内追加",
          quantity: 1,
          price: 0,
          referencePrice: 80,
        },
      ],
    },
    {
      id: "cake",
      productId: "cake",
      externalId: "square-cake",
      name: "菓子",
      quantity: 1,
      unitPrice: 333,
      referencePrice: 333,
      total: 333,
      options: [],
    },
  ],
  adjustments: [
    { id: "extra-charge", name: "追加料金", amount: 100 },
    { id: "coupon", name: "クーポン", amount: -333 },
  ],
};
export const order = (amount = 2400, state = "OPEN") => ({
  id: "square-order",
  location_id: "square-location",
  state,
  version: 7,
  total_money: { amount, currency: "JPY" },
});
export const checkout = (status: string, cancelReason?: string) => ({
  id: "square-checkout",
  order_id: "square-order",
  location_id: "square-location",
  amount_money: { amount: 2400, currency: "JPY" },
  device_options: { device_id: "square-device" },
  status,
  cancel_reason: cancelReason,
  payment_ids: status === "COMPLETED" ? ["square-payment"] : [],
});

export const catalogTax = {
  type: "TAX",
  id: "tax-10",
  tax_data: {
    calculation_phase: "TAX_SUBTOTAL_PHASE",
    inclusion_type: "INCLUSIVE",
    percentage: "10.0",
    applies_to_custom_amounts: true,
    enabled: true,
  },
};

export function quoteCatalogResponses(
  value: PosInvoice = invoice,
  taxation: {
    extraTaxes?: Record<string, unknown>[];
    isTaxable?: boolean;
    tax?: Record<string, unknown>;
    taxIds?: string[];
  } = {},
) {
  return [
    {
      body: {
        locations: [{ id: "square-location", name: "日本店", currency: "JPY", status: "ACTIVE" }],
      },
    },
    {
      body: {
        objects: [
          ...value.lines
            .filter((line) => line.externalId)
            .flatMap((line, index) => [
              {
                type: "ITEM",
                id: `item-${index}`,
                item_data: {
                  name: line.name,
                  tax_ids: taxation.taxIds ?? [catalogTax.id],
                  is_taxable: taxation.isTaxable ?? true,
                  modifier_list_info: [{ modifier_list_id: `list-${index}` }],
                  variations: [
                    {
                      type: "ITEM_VARIATION",
                      id: line.externalId,
                      item_variation_data: {
                        item_id: `item-${index}`,
                        price_money: { amount: line.referencePrice, currency: "JPY" },
                      },
                    },
                  ],
                },
              },
              {
                type: "MODIFIER_LIST",
                id: `list-${index}`,
                modifier_list_data: {
                  modifiers: line.options.map((option) => ({
                    type: "MODIFIER",
                    id: option.externalId,
                    modifier_data: {
                      modifier_list_id: `list-${index}`,
                      name: option.name,
                      price_money: { amount: option.referencePrice, currency: "JPY" },
                    },
                  })),
                },
              },
            ]),
          taxation.tax ?? catalogTax,
          ...(taxation.extraTaxes ?? []),
        ],
      },
    },
  ];
}

export function catalogResponses() {
  return [
    {
      body: {
        locations: [
          { id: "square-location", name: "日本店", currency: "JPY", status: "ACTIVE" },
          { id: "inactive", currency: "JPY", status: "INACTIVE" },
          { id: "dollars", currency: "USD", status: "ACTIVE" },
        ],
      },
    },
    {
      body: {
        cursor: "next-page",
        objects: [
          catalogTax,
          {
            type: "ITEM",
            id: "item",
            item_data: {
              name: "ラテ",
              tax_ids: [catalogTax.id],
              is_taxable: true,
              modifier_list_info: [{ modifier_list_id: "milk" }],
              variations: [
                {
                  type: "ITEM_VARIATION",
                  id: "latte",
                  item_variation_data: {
                    item_id: "item",
                    name: "標準",
                    price_money: { amount: 500, currency: "JPY" },
                    location_overrides: [
                      {
                        location_id: "square-location",
                        price_money: { amount: 550, currency: "JPY" },
                      },
                    ],
                  },
                },
                {
                  type: "ITEM_VARIATION",
                  id: "variable",
                  item_variation_data: {
                    item_id: "item",
                    name: "変動",
                    pricing_type: "VARIABLE_PRICING",
                  },
                },
                {
                  type: "ITEM_VARIATION",
                  id: "other-location",
                  present_at_all_locations: false,
                  present_at_location_ids: ["elsewhere"],
                  item_variation_data: { item_id: "item" },
                },
              ],
            },
          },
          {
            type: "ITEM",
            id: "archived",
            item_data: {
              name: "廃止商品",
              is_archived: true,
              variations: [
                {
                  type: "ITEM_VARIATION",
                  id: "archived-variation",
                  item_variation_data: { item_id: "archived" },
                },
              ],
            },
          },
        ],
      },
    },
    {
      body: {
        objects: [
          {
            type: "MODIFIER_LIST",
            id: "milk",
            modifier_list_data: {
              modifiers: [
                {
                  type: "MODIFIER",
                  id: "oat",
                  modifier_data: {
                    modifier_list_id: "milk",
                    name: "オーツ",
                    price_money: { amount: 100, currency: "JPY" },
                    location_overrides: [
                      {
                        location_id: "square-location",
                        price_money: { amount: 80, currency: "JPY" },
                        sold_out: true,
                      },
                    ],
                  },
                },
                {
                  type: "MODIFIER",
                  id: "negative",
                  modifier_data: {
                    modifier_list_id: "milk",
                    name: "減量",
                    price_money: { amount: -50, currency: "JPY" },
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ];
}
