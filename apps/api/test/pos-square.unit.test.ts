import { afterEach, describe, expect, it, vi } from "vitest";
import type { PosInvoice } from "../src/modules/pos/model";
import {
  createSquareAdapter,
  exchangeSquareToken,
  revokeSquareToken,
  squareAuthorizationUrl,
  squareCapabilities,
  verifySquareWebhook,
} from "../src/modules/pos/square";
import { checkout, invoice, order, quoteCatalogResponses, transport } from "./pos-square-fixture";

afterEach(() => vi.unstubAllGlobals());

describe("Squareの明細変換", () => {
  it("プラン内の0円・負modifier・クーポンをCatalog参照を保って正規wireへ変換する", async () => {
    const wire = transport([...quoteCatalogResponses(), { body: { order: order() } }]);
    const adapter = createSquareAdapter("tablecast-token", {
      environment: "sandbox",
      fetch: wire.fetch,
    });
    expect(adapter.capabilities).toBe(squareCapabilities);
    await expect(adapter.quote(invoice, "square-location")).resolves.toEqual({
      amount: 2400,
      currency: "JPY",
    });
    expect(wire.calls[0]?.url.origin).toBe("https://connect.squareupsandbox.com");
    expect(wire.calls[2]?.url.pathname).toBe("/v2/orders/calculate");
    expect(wire.calls[0]?.headers.get("authorization")).toBe("Bearer tablecast-token");
    expect(wire.calls[0]?.headers.get("square-version")).toBe("2026-09-16");
    expect(wire.calls[2]?.body).toMatchObject({
      order: {
        location_id: "square-location",
        reference_id: invoice.id,
        pricing_options: { auto_apply_discounts: false, auto_apply_taxes: false },
        taxes: [{ type: "INCLUSIVE", percentage: "10", scope: "ORDER" }],
        line_items: [
          {
            quantity: "2",
            catalog_object_id: "square-latte",
            base_price_money: { amount: 1000, currency: "JPY" },
            modifiers: [
              {
                catalog_object_id: "square-extra",
                quantity: "2",
                base_price_money: { amount: 100 },
              },
              { catalog_object_id: "square-less", quantity: "1", base_price_money: { amount: 0 } },
            ],
            applied_discounts: [{ discount_uid: "discount-0" }],
            note: "減量: -50円 × 1（商品1点当たり）\nクーポン: -280円（会計全体 -333円）",
          },
          {
            catalog_object_id: "square-tea",
            base_price_money: { amount: 0 },
            modifiers: [{ catalog_object_id: "square-included", base_price_money: { amount: 0 } }],
          },
          {
            catalog_object_id: "square-cake",
            base_price_money: { amount: 333 },
            applied_discounts: [{ discount_uid: "discount-2" }],
          },
          {
            name: "追加料金",
            base_price_money: { amount: 100 },
            applied_discounts: [{ discount_uid: "discount-3" }],
          },
        ],
        discounts: [
          {
            uid: "discount-0",
            scope: "LINE_ITEM",
            type: "FIXED_AMOUNT",
            amount_money: { amount: 380 },
          },
          {
            uid: "discount-2",
            scope: "LINE_ITEM",
            type: "FIXED_AMOUNT",
            amount_money: { amount: 41 },
          },
          {
            uid: "discount-3",
            scope: "LINE_ITEM",
            type: "FIXED_AMOUNT",
            amount_money: { amount: 12 },
          },
        ],
      },
    });
  });

  it("円未満の配賦を残さず、複数の割引でも0円行を値引きしない", async () => {
    const value: PosInvoice = {
      ...invoice,
      total: 0,
      adjustments: [
        { id: "a", name: "値引A", amount: -2 },
        { id: "b", name: "値引B", amount: -1 },
      ],
      lines: [1, 1, 1, 0].map((price, index) => ({
        ...invoice.lines[2],
        id: `line-${index}`,
        name: "菓子",
        productId: "cake",
        externalId: "square-cake",
        quantity: 1,
        referencePrice: 1,
        unitPrice: price,
        total: price,
        options: [],
      })),
    };
    const wire = transport([...quoteCatalogResponses(value), { body: { order: order(0) } }]);
    await createSquareAdapter("token", { environment: "sandbox", fetch: wire.fetch }).quote(
      value,
      "square-location",
    );
    expect(wire.calls[2]?.body).toMatchObject({
      order: {
        discounts: [
          { uid: "discount-0", amount_money: { amount: 1 } },
          { uid: "discount-1", amount_money: { amount: 1 } },
          { uid: "discount-2", amount_money: { amount: 1 } },
        ],
      },
    });
  });

  it("承認合計の不整合や割引超過は送信前に拒否する", async () => {
    const wire = transport([]);
    const adapter = createSquareAdapter("token", { environment: "sandbox", fetch: wire.fetch });
    await expect(
      adapter.quote({ ...invoice, total: 2399 }, "square-location"),
    ).rejects.toMatchObject({ code: "POS_UNSUPPORTED", status: 422 });
    await expect(
      adapter.quote(
        { ...invoice, adjustments: [{ id: "excess", name: "超過", amount: -99999 }] },
        "square-location",
      ),
    ).rejects.toMatchObject({ code: "POS_UNSUPPORTED" });
    expect(wire.fetch).not.toHaveBeenCalled();
  });

  it("同じ冪等キーの再試行を同じwireで送り、SDK応答を内部型へ閉じる", async () => {
    const wire = transport([{ body: { order: order() } }, { body: { order: order() } }]);
    const adapter = createSquareAdapter("token", { environment: "sandbox", fetch: wire.fetch });
    const expected = {
      id: "square-order",
      locationId: "square-location",
      amount: 2400,
      currency: "JPY",
      status: "open",
      paymentIds: [],
    };
    await expect(
      adapter.createOrder(invoice, "square-location", "tablecast-idempotency"),
    ).resolves.toEqual(expected);
    await expect(
      adapter.createOrder(invoice, "square-location", "tablecast-idempotency"),
    ).resolves.toEqual(expected);
    expect(wire.calls[0]?.body).toEqual(wire.calls[1]?.body);
    expect(wire.calls[0]?.body).toMatchObject({ idempotency_key: "tablecast-idempotency" });
  });
});

describe("Squareの精算状態", () => {
  it("Terminal開始の応答喪失後は完了注文にも同じwireと冪等キーを再送できる", async () => {
    const wire = transport([new Error("応答喪失"), { body: { checkout: checkout("COMPLETED") } }]);
    const adapter = createSquareAdapter("token", { environment: "sandbox", fetch: wire.fetch });
    const remote = {
      id: "square-order",
      locationId: "square-location",
      amount: 2400,
      currency: "JPY",
      status: "open",
      paymentIds: [],
    } satisfies Parameters<NonNullable<typeof adapter.checkout>["start"]>[0];
    await expect(
      adapter.checkout?.start(remote, "square-device", "same-key"),
    ).rejects.toMatchObject({ code: "POS_UNKNOWN_OUTCOME" });
    await expect(
      adapter.checkout?.start({ ...remote, status: "completed" }, "square-device", "same-key"),
    ).resolves.toMatchObject({ status: "completed", paymentIds: ["square-payment"] });
    expect(wire.calls[0]?.body).toEqual(wire.calls[1]?.body);
  });

  it("0円は注文版付きPayOrderを使い、再試行は完了状態から回復する", async () => {
    const wire = transport([
      { body: { order: order(0) } },
      { body: { order: order(0, "COMPLETED") } },
      { body: { order: order(0, "COMPLETED") } },
    ]);
    await expect(
      createSquareAdapter("token", { environment: "sandbox", fetch: wire.fetch }).settleZeroOrder(
        "square-order",
        "zero-key",
      ),
    ).resolves.toMatchObject({ status: "completed", amount: 0 });
    expect(wire.calls.map((call) => call.url.pathname)).toEqual([
      "/v2/orders/square-order",
      "/v2/orders/square-order/pay",
    ]);
    expect(wire.calls[1]?.body).toEqual({
      idempotency_key: "zero-key",
      order_version: 7,
      payment_ids: [],
    });
    await expect(
      createSquareAdapter("token", { environment: "sandbox", fetch: wire.fetch }).settleZeroOrder(
        "square-order",
        "zero-key",
      ),
    ).resolves.toMatchObject({ status: "completed" });
    expect(wire.calls).toHaveLength(3);
  });

  it("未払OPEN注文だけを版付きで取消し、再照会のCANCELEDを終端として返す", async () => {
    const wire = transport([
      { body: { order: order() } },
      { body: { order: order(2400, "CANCELED") } },
      { body: { order: order(2400, "CANCELED") } },
    ]);
    const adapter = createSquareAdapter("token", { environment: "sandbox", fetch: wire.fetch });
    await expect(adapter.cancelOrder?.("square-order")).resolves.toMatchObject({
      status: "cancelled",
    });
    await expect(adapter.cancelOrder?.("square-order")).resolves.toMatchObject({
      status: "cancelled",
    });
    expect(wire.calls[1]?.body).toMatchObject({
      order: { location_id: "square-location", state: "CANCELED", version: 7 },
    });
    expect(wire.calls).toHaveLength(3);
  });

  it.each([
    ["PENDING", undefined, "pending"],
    ["IN_PROGRESS", undefined, "pending"],
    ["CANCEL_REQUESTED", undefined, "pending"],
    ["CANCELED", "SELLER_CANCELED", "cancelled"],
    ["CANCELED", "TIMED_OUT", "unknown"],
    ["COMPLETED", undefined, "completed"],
    ["FUTURE_STATE", undefined, "unknown"],
  ])("Terminal状態%sと取消理由%sを正規化する", async (status, reason, expected) => {
    const wire = transport([{ body: { checkout: checkout(status ?? "", reason) } }]);
    const adapter = createSquareAdapter("token", { environment: "sandbox", fetch: wire.fetch });
    await expect(adapter.checkout?.get("square-checkout")).resolves.toMatchObject({
      status: expected,
    });
  });

  it("明細付き・チップとサーチャージなしで開始し、取消要求を取消完了と扱わない", async () => {
    const wire = transport([
      { body: { checkout: checkout("PENDING") } },
      { body: { checkout: checkout("CANCEL_REQUESTED") } },
    ]);
    const adapter = createSquareAdapter("token", { environment: "sandbox", fetch: wire.fetch });
    await adapter.checkout?.start(
      {
        id: "square-order",
        locationId: "square-location",
        amount: 2400,
        currency: "JPY",
        status: "open",
        paymentIds: [],
      },
      "square-device",
      "checkout-key",
    );
    expect(wire.calls[0]?.body).toMatchObject({
      idempotency_key: "checkout-key",
      checkout: {
        order_id: "square-order",
        amount_money: { amount: 2400, currency: "JPY" },
        payment_type: "CARD_PRESENT",
        payment_options: { autocomplete: true },
        device_options: {
          device_id: "square-device",
          allow_auto_card_surcharge: false,
          show_itemized_cart: true,
          tip_settings: { allow_tipping: false },
        },
      },
    });
    await expect(adapter.checkout?.cancel("square-checkout")).resolves.toMatchObject({
      status: "pending",
    });
  });

  it.each([
    { refunded: 0, tip: 0, total: 2400, surcharge: 0, completed: true },
    { refunded: 100, tip: 0, total: 2400, surcharge: 0, completed: false },
    { refunded: 0, tip: 100, total: 2500, surcharge: 0, completed: false },
    { refunded: 0, tip: 0, total: 2500, surcharge: 0, completed: false },
    { refunded: 0, tip: 0, total: 2400, surcharge: 100, completed: false },
  ])(
    "Paymentの注文・店舗・返金$refunded・チップ$tip・総額$total・追加$surchargeを照合する",
    async ({ refunded, tip, total, surcharge, completed }) => {
      const wire = transport([
        {
          body: {
            payment: {
              id: "payment",
              order_id: "square-order",
              location_id: "square-location",
              terminal_checkout_id: "square-checkout",
              amount_money: { amount: 2400, currency: "JPY" },
              status: "COMPLETED",
              refunded_money: { amount: refunded, currency: "JPY" },
              tip_money: { amount: tip, currency: "JPY" },
              total_money: { amount: total, currency: "JPY" },
              card_details: {
                applied_card_surcharge_details: {
                  card_surcharge_money: { amount: surcharge, currency: "JPY" },
                },
              },
            },
          },
        },
      ]);
      await expect(
        createSquareAdapter("token", { environment: "sandbox", fetch: wire.fetch }).getPayment(
          "payment",
        ),
      ).resolves.toEqual({
        id: "payment",
        orderId: "square-order",
        locationId: "square-location",
        checkoutId: "square-checkout",
        amount: 2400,
        currency: "JPY",
        completed,
      });
    },
  );
});

describe("Squareの障害境界とOAuth", () => {
  it("環境未指定は本番へ接続し、OAuthで明示ログインを要求する", async () => {
    const wire = transport([{ body: { order: order() } }]);
    await createSquareAdapter("token", { fetch: wire.fetch }).getOrder("square-order");
    expect(wire.calls[0]?.url.origin).toBe("https://connect.squareup.com");
    const url = new URL(
      squareAuthorizationUrl("production-app", "csrf-state", "https://tablecast.example/callback"),
    );
    expect(url.origin).toBe("https://connect.squareup.com");
    expect(url.searchParams.get("session")).toBe("false");
    expect(url.searchParams.get("scope")).toContain("DEVICE_CREDENTIAL_MANAGEMENT");
  });

  it.each([
    new Error("secret-token must not escape"),
    { body: { order: { id: "square-order", location_id: "square-location" } } },
    { status: 500, body: { errors: [] } },
  ])("送信後の応答喪失・不正応答を結果不明にし、自動再試行しない", async (response) => {
    const wire = transport([response]);
    const error = await createSquareAdapter("token", { environment: "sandbox", fetch: wire.fetch })
      .createOrder(invoice, "square-location", "same-key")
      .catch((value: unknown) => value);
    expect(error).toMatchObject({ code: "POS_UNKNOWN_OUTCOME", status: 409 });
    expect(String(error)).not.toContain("secret-token");
    expect(wire.fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    [401, "POS_AUTH_REQUIRED", 401],
    [403, "POS_AUTH_REQUIRED", 401],
    [400, "POS_UNSUPPORTED", 422],
    [429, "POS_PROVIDER_UNAVAILABLE", 503],
    [500, "POS_PROVIDER_UNAVAILABLE", 503],
  ])("HTTP %sの生応答を公開しない", async (status, code, expectedStatus) => {
    const wire = transport([
      {
        status,
        body: {
          errors: [
            { category: "API_ERROR", code: "INTERNAL_SERVER_ERROR", detail: "secret-value" },
          ],
        },
      },
    ]);
    const error = await createSquareAdapter("token", { environment: "sandbox", fetch: wire.fetch })
      .getOrder("square-order")
      .catch((value: unknown) => value);
    expect(error).toMatchObject({ code, status: expectedStatus });
    expect(String(error)).not.toContain("secret-value");
  });

  it("認可URL・code交換・refresh・revokeをSandboxの公式wireへ送る", async () => {
    const wire = transport([
      {
        body: {
          access_token: "access",
          refresh_token: "refresh",
          merchant_id: "merchant",
          expires_at: "2026-11-29T00:00:00Z",
        },
      },
      {
        body: {
          access_token: "renewed",
          refresh_token: "refresh",
          merchant_id: "merchant",
          expires_at: "2026-12-01T00:00:00Z",
        },
      },
      { body: { success: true } },
    ]);
    vi.stubGlobal("fetch", wire.fetch);
    const url = new URL(
      squareAuthorizationUrl("sandbox-app", "csrf-state", "https://tablecast.example/callback", {
        environment: "sandbox",
      }),
    );
    expect(url.origin).toBe("https://connect.squareupsandbox.com");
    expect(url.searchParams.get("state")).toBe("csrf-state");
    expect(url.searchParams.get("scope")).toContain("ITEMS_READ");
    await expect(
      exchangeSquareToken(
        {
          applicationId: "sandbox-app",
          applicationSecret: "secret",
          code: "auth-code",
        },
        { environment: "sandbox" },
      ),
    ).resolves.toEqual({
      accessToken: "access",
      refreshToken: "refresh",
      merchantId: "merchant",
      expiresAt: Date.parse("2026-11-29T00:00:00Z"),
    });
    await exchangeSquareToken(
      {
        applicationId: "sandbox-app",
        applicationSecret: "secret",
        refreshToken: "refresh",
      },
      { environment: "sandbox" },
    );
    await revokeSquareToken("sandbox-app", "secret", "renewed", { environment: "sandbox" });
    expect(wire.calls[0]?.body).toMatchObject({
      client_id: "sandbox-app",
      client_secret: "secret",
      code: "auth-code",
      grant_type: "authorization_code",
    });
    expect(wire.calls[1]?.body).toMatchObject({
      refresh_token: "refresh",
      grant_type: "refresh_token",
    });
    expect(wire.calls[2]?.headers.get("authorization")).toBe("Client secret");
    expect(wire.calls[2]?.body).toEqual({
      client_id: "sandbox-app",
      access_token: "renewed",
      revoke_only_access_token: true,
    });
    expect(wire.calls[2]?.url.origin).toBe("https://connect.squareupsandbox.com");
  });

  it("Webhookをraw body・通知URLで検証し、改ざんと壊れた署名を拒否する", async () => {
    const body = '{"event_id":"square-event", "type":"payment.updated"}';
    const notificationUrl = "https://tablecast.example/api/pos/square/webhook";
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode("signature-key"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = btoa(
      String.fromCharCode(
        ...new Uint8Array(
          await crypto.subtle.sign("HMAC", key, encoder.encode(notificationUrl + body)),
        ),
      ),
    );
    await expect(
      verifySquareWebhook(body, signature, notificationUrl, "signature-key"),
    ).resolves.toBe(true);
    await expect(
      verifySquareWebhook(body.replace(" ", ""), signature, notificationUrl, "signature-key"),
    ).resolves.toBe(false);
    await expect(
      verifySquareWebhook(body, signature, `${notificationUrl}/`, "signature-key"),
    ).resolves.toBe(false);
    await expect(
      verifySquareWebhook(body, "broken%%", notificationUrl, "signature-key"),
    ).resolves.toBe(false);
  });
});
