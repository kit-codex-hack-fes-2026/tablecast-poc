import { describe, expect, it } from "vitest";
import { createSquareAdapter } from "../src/modules/pos/square";
import {
  catalogResponses,
  catalogTax,
  invoice,
  order,
  quoteCatalogResponses,
  transport,
} from "./pos-square-fixture";

type Taxation = NonNullable<Parameters<typeof quoteCatalogResponses>[1]>;
const unsupportedTaxes: { name: string; taxation: Taxation }[] = [
  ...[
    { name: "軽減税率8%", percentage: "8" },
    { name: "税抜価格", inclusion_type: "ADDITIVE" },
    { name: "無効な税", enabled: false },
    { name: "税率未設定", percentage: undefined },
    { name: "小数形式ではない税率", percentage: "1e1" },
    { name: "有効状態不明", enabled: undefined },
    { name: "計算フェーズ不明", calculation_phase: undefined },
    { name: "合計への複合課税", calculation_phase: "TAX_TOTAL_PHASE" },
    { name: "商品集合の条件付き課税", applies_to_product_set_id: "product-set" },
  ].map(({ name, ...taxData }) => ({
    name,
    taxation: { tax: { ...catalogTax, tax_data: { ...catalogTax.tax_data, ...taxData } } },
  })),
  { name: "税の紐付けなし", taxation: { taxIds: [] } },
  { name: "非課税商品", taxation: { isTaxable: false } },
  { name: "不明な税の参照", taxation: { taxIds: ["missing-tax"] } },
  {
    name: "店舗対象外の税",
    taxation: { tax: { ...catalogTax, absent_at_location_ids: ["square-location"] } },
  },
  { name: "削除済みの税", taxation: { tax: { ...catalogTax, is_deleted: true } } },
  {
    name: "複数税の紐付け",
    taxation: {
      taxIds: [catalogTax.id, "other-tax"],
      extraTaxes: [{ ...catalogTax, id: "other-tax" }],
    },
  },
];

describe("Squareの商品候補", () => {
  it("プラン内0円商品と0円modifierも通常Catalog価格の1円差で送信を止める", async () => {
    const changed = {
      ...invoice,
      lines: invoice.lines.map((line) => ({
        ...line,
        referencePrice: line.referencePrice + 1,
        options: line.options.map((option) => ({
          ...option,
          referencePrice: option.referencePrice + 1,
        })),
      })),
    };
    const wire = transport(quoteCatalogResponses(changed));
    const result = await createSquareAdapter("token", { environment: "sandbox", fetch: wire.fetch })
      .quote(invoice, "square-location")
      .catch((error: unknown) => error);
    const issues: unknown = expect.arrayContaining([
      {
        code: "POS_PRICE_MISMATCH",
        localId: "tea",
        name: "プラン内のお茶",
        expected: 600,
        actual: 601,
      },
      {
        code: "POS_PRICE_MISMATCH",
        localId: "included-extra",
        name: "プラン内追加",
        expected: 80,
        actual: 81,
      },
    ]);
    expect(result).toMatchObject({
      code: "POS_PRICE_MISMATCH",
      status: 409,
      details: issues,
    });
    expect(wire.calls).toHaveLength(2);
  });

  it("対応付け済みの商品・選択肢が削除された場合は送信しない", async () => {
    const removed = { ...invoice, lines: invoice.lines.filter((line) => line.id !== "paid") };
    const wire = transport(quoteCatalogResponses(removed));
    const issues: unknown = expect.arrayContaining([
      { code: "POS_PRODUCT_UNAVAILABLE", localId: "latte", name: "ラテ" },
      { code: "POS_PRODUCT_UNAVAILABLE", localId: "extra", name: "追加" },
    ]);
    await expect(
      createSquareAdapter("token", { environment: "sandbox", fetch: wire.fetch }).quote(
        invoice,
        "square-location",
      ),
    ).rejects.toMatchObject({
      code: "POS_PRODUCT_UNAVAILABLE",
      details: issues,
    });
    expect(wire.calls).toHaveLength(2);
  });

  it("店舗で売切のmodifierはCalculateOrderへ送らない", async () => {
    const line = {
      ...invoice.lines[0],
      id: "sold-out",
      productId: "latte",
      externalId: "latte",
      name: "ラテ",
      quantity: 1,
      unitPrice: 550,
      referencePrice: 550,
      total: 630,
      options: [
        {
          id: "oat",
          externalId: "oat",
          name: "オーツ",
          quantity: 1,
          price: 80,
          referencePrice: 80,
        },
      ],
    };
    const wire = transport(catalogResponses());
    await expect(
      createSquareAdapter("token", { environment: "sandbox", fetch: wire.fetch }).quote(
        { ...invoice, lines: [line], adjustments: [], total: 630 },
        "square-location",
      ),
    ).rejects.toMatchObject({
      code: "POS_PRODUCT_UNAVAILABLE",
      details: [{ code: "POS_PRODUCT_UNAVAILABLE", localId: "oat", name: "オーツ" }],
    });
    expect(wire.calls).toHaveLength(3);
  });

  it("全pageを取得し、店舗限定・店舗別単価・売切・変動価格を区別する", async () => {
    const wire = transport(catalogResponses());
    const catalog = await createSquareAdapter("token", {
      environment: "sandbox",
      fetch: wire.fetch,
    }).catalog("square-location");
    expect(catalog).toEqual({
      locations: [{ id: "square-location", name: "日本店" }],
      issues: [],
      items: [
        {
          id: "latte",
          name: "ラテ / 標準",
          price: 550,
          available: true,
          options: [
            { id: "oat", name: "オーツ", price: 80, available: false },
            { id: "negative", name: "減量", price: -50, available: true },
          ],
        },
        {
          id: "variable",
          name: "ラテ / 変動",
          price: null,
          available: false,
          options: [
            { id: "oat", name: "オーツ", price: 80, available: false },
            { id: "negative", name: "減量", price: -50, available: true },
          ],
        },
      ],
    });
    expect(wire.calls[1]?.url.searchParams.get("types")).toBe(
      "ITEM,ITEM_VARIATION,MODIFIER_LIST,MODIFIER,TAX",
    );
    expect(wire.calls[2]?.url.searchParams.get("cursor")).toBe("next-page");
  });

  it.each(unsupportedTaxes)("本番の$nameは同価格でも送信しない", async ({ taxation }) => {
    const wire = transport(quoteCatalogResponses(invoice, taxation));
    await expect(
      createSquareAdapter("token", { fetch: wire.fetch }).quote(invoice, "square-location"),
    ).rejects.toMatchObject({ code: "POS_UNSUPPORTED", status: 422 });
    expect(wire.calls).toHaveLength(2);
    expect(wire.calls.every((call) => call.url.hostname === "connect.squareup.com")).toBe(true);
  });

  it("追加料金の税が商品限定なら本番のad hoc行を送信しない", async () => {
    const wire = transport(
      quoteCatalogResponses(invoice, {
        tax: {
          ...catalogTax,
          tax_data: { ...catalogTax.tax_data, applies_to_custom_amounts: false },
        },
      }),
    );
    await expect(
      createSquareAdapter("token", { fetch: wire.fetch }).quote(invoice, "square-location"),
    ).rejects.toMatchObject({
      code: "POS_UNSUPPORTED",
      details: [{ code: "POS_UNSUPPORTED", localId: "extra-charge", name: "追加料金" }],
    });
    expect(wire.calls).toHaveLength(2);
  });

  it("本番で税込10%を検証して見積と注文作成へ同じ税と固定明細を送る", async () => {
    const wire = transport([
      ...quoteCatalogResponses(),
      { body: { order: order() } },
      { body: { order: order() } },
    ]);
    const adapter = createSquareAdapter("token", { fetch: wire.fetch });
    await expect(adapter.quote(invoice, "square-location")).resolves.toEqual({
      amount: invoice.total,
      currency: "JPY",
    });
    await expect(
      adapter.createOrder(invoice, "square-location", "same-key"),
    ).resolves.toMatchObject({
      amount: invoice.total,
      currency: "JPY",
    });
    expect(wire.calls[2]?.body).toMatchObject({
      order: {
        taxes: [{ type: "INCLUSIVE", percentage: "10", scope: "ORDER" }],
        pricing_options: { auto_apply_taxes: false, auto_apply_discounts: false },
      },
    });
    const created = wire.calls[3]?.body;
    if (!created || typeof created !== "object" || !("order" in created))
      throw new Error("注文作成リクエストに明細がありません");
    expect(wire.calls[2]?.body).toEqual({ order: created.order });
    expect(wire.calls[3]?.body).toMatchObject({ idempotency_key: "same-key" });
    expect(wire.calls).toHaveLength(4);
  });
});

describe("Squareの注文作成拒否", () => {
  it.each([
    [400, "INVALID_REQUEST_ERROR", "INVALID_VALUE", 422],
    [401, "AUTHENTICATION_ERROR", "ACCESS_TOKEN_EXPIRED", 401],
    [403, "AUTHENTICATION_ERROR", "INSUFFICIENT_SCOPES", 401],
    [404, "INVALID_REQUEST_ERROR", "NOT_FOUND", 422],
    [422, "INVALID_REQUEST_ERROR", "UNPROCESSABLE_ENTITY", 422],
    [429, "RATE_LIMIT_ERROR", "RATE_LIMITED", 503],
  ])(
    "HTTP %s の明確な作成拒否だけを専用エラーにする",
    async (status, category, code, expectedStatus) => {
      const wire = transport([
        { status, body: { errors: [{ category, code, detail: "secret-value" }] } },
      ]);
      const error = await createSquareAdapter("token", {
        environment: "sandbox",
        fetch: wire.fetch,
      })
        .createOrder(invoice, "square-location", "same-key")
        .catch((value: unknown) => value);
      expect(error).toMatchObject({ code: "POS_ORDER_REJECTED", status: expectedStatus });
      expect(error).not.toHaveProperty("details", expect.anything());
      expect(error).not.toHaveProperty("cause", expect.anything());
      expect(String(error)).not.toContain("secret-value");
      expect(wire.fetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    [400, "INVALID_REQUEST_ERROR", "IDEMPOTENCY_KEY_REUSED"],
    [400, "INVALID_REQUEST_ERROR", "CONFLICT"],
    [400, "INVALID_REQUEST_ERROR", "REQUEST_TIMEOUT"],
    [400, "INVALID_REQUEST_ERROR", "TEMPORARY_ERROR"],
    [400, "API_ERROR", "INTERNAL_SERVER_ERROR"],
    [408, "INVALID_REQUEST_ERROR", "REQUEST_TIMEOUT"],
    [409, "INVALID_REQUEST_ERROR", "CONFLICT"],
    [500, "API_ERROR", "INTERNAL_SERVER_ERROR"],
    [502, "API_ERROR", "BAD_GATEWAY"],
  ])("HTTP %s / %s / %s の競合・不明結果では未作成を断定しない", async (status, category, code) => {
    const wire = transport([{ status, body: { errors: [{ category, code }] } }]);
    await expect(
      createSquareAdapter("token", { environment: "sandbox", fetch: wire.fetch }).createOrder(
        invoice,
        "square-location",
        "same-key",
      ),
    ).rejects.toMatchObject({ code: "POS_UNKNOWN_OUTCOME", status: 409 });
    expect(wire.fetch).toHaveBeenCalledTimes(1);
  });

  it("400でもエラー情報が欠ける応答は未作成の証拠にしない", async () => {
    const wire = transport([{ status: 400, body: { errors: [] } }]);
    await expect(
      createSquareAdapter("token", { environment: "sandbox", fetch: wire.fetch }).createOrder(
        invoice,
        "square-location",
        "same-key",
      ),
    ).rejects.toMatchObject({ code: "POS_UNKNOWN_OUTCOME", status: 409 });
  });
});
