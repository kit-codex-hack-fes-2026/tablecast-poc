import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import type { DisplayCurrencyContext } from "../src/modules/currency/model";
import type { voiceToolNameSchema } from "../src/modules/voice/model";
import app from "../src/app";
import * as business from "../src/db/business-schema";
import { exchangeRatesSchema } from "../src/modules/currency/model";
import { initialiseExchangeRates } from "../src/modules/currency/service";
import { getTableState } from "../src/modules/tables/queries";
import { createCastTools } from "../src/modules/voice/agent";
import { invokeVoiceTool } from "../src/modules/voice/realtime";
import { setVoiceSession } from "../src/modules/voice/service";
import { createApiServices } from "../src/platform/context";
import { configuration, device, deviceToken, setupFixture } from "./fixture";

afterEach(() => vi.restoreAllMocks());
const services = () => createApiServices(env);
const source = { date: "2026-10-22", jpy: { jpy: 1, aud: 0.00967, usd: 0.0065, krw: 9.12 } };
async function setupVoice() {
  await setupFixture();
  await setVoiceSession(services(), device, "tablecast-currency-voice");
  await services()
    .db.insert(business.voiceTurns)
    .values({
      id: "tablecast-currency-turn",
      voice_session_id: "tablecast-currency-voice",
      table_session_id: device.tableSessionId ?? "",
      store_id: device.storeId,
      status: "started",
      started_at: Date.now(),
      locale: "ja",
    });
  await services()
    .db.update(business.tableSessions)
    .set({ active_turn_id: "tablecast-currency-turn" })
    .where(eq(business.tableSessions.id, device.tableSessionId ?? ""));
}
const tool = (
  name: z.infer<typeof voiceToolNameSchema>,
  args: Record<string, unknown>,
  displayCurrency?: DisplayCurrencyContext,
  turnId = "tablecast-currency-turn",
) =>
  invokeVoiceTool(
    services(),
    {
      voiceSessionId: "tablecast-currency-voice",
      turnId,
      toolCallId: crypto.randomUUID(),
      toolName: name,
      arguments: args,
      displayCurrency,
    },
    new AbortController().signal,
  );

const request = async (cookie: string) => {
  const ctx = createExecutionContext();
  const response = await app.request(
    "http://localhost:3000/api/table/exchange-rates",
    {
      headers: { Cookie: cookie },
    },
    env,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
};

it("認証済みの初期化が公開参考レートを返し、円を基準として扱う", async () => {
  await setupFixture();
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(source));

  expect((await request("")).status).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
  const response = await request(`tablecast.device=${deviceToken}`);
  expect(response.status).toBe(200);
  const snapshot = exchangeRatesSchema.parse(await response.json());
  expect(snapshot).toMatchObject({ base: "JPY", rates: { AUD: 0.00967 } });
  expect(snapshot).not.toHaveProperty("token");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("初期取得の失敗時だけ代替CDNを試し、取得不能を円の注文失敗と混同しない", async () => {
  await setupFixture();
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(Response.json(source));
  expect(await initialiseExchangeRates(services(), device)).toMatchObject({
    rates: { AUD: 0.00967 },
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[1]?.[0]).toEqual(expect.stringContaining("currency-api.pages.dev"));
  fetch.mockReset().mockResolvedValue(new Response(null, { status: 503 }));
  await expect(initialiseExchangeRates(services(), device)).rejects.toMatchObject({
    code: "DISPLAY_RATES_UNAVAILABLE",
  });
  expect((await getTableState(services(), device)).status).toBe("open");
});

it("商品と卓の円を残して参考額を返し、照会だけでは通貨表示を変更しない", async () => {
  await setupVoice();
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(source));
  const snapshot = await initialiseExchangeRates(services(), device);
  const context = { currency: null, revision: 2, rates: snapshot };
  const catalog = await tool("getCatalog", { quoteCurrency: "AUD", includePlans: true }, context);
  const product = configuration.products[0];
  if (!product) throw new Error("商品fixtureが必要です");
  expect(catalog).not.toHaveProperty("displayCurrencyAction");
  expect(catalog.result).toMatchObject({
    total: configuration.products.length,
    displayCurrency: { currency: "AUD", status: "ready", rate: 0.00967 },
  });
  expect(z.object({ products: z.array(z.unknown()) }).parse(catalog.result).products).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        price: product.price,
        approximate: { price: Number((product.price * 0.00967).toFixed(2)) },
      }),
    ]),
  );
  expect((await tool("getTableState", {}, context)).result).toMatchObject({
    displayCurrency: { status: "off" },
  });
  expect((await tool("getTableState", { quoteCurrency: "USD" }, context)).result).toMatchObject({
    displayCurrency: { currency: "USD", status: "ready" },
    cart: { total: 0, approximate: { total: 0 } },
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("通貨切替は端末への指示だけを返し、カートや音声状態を書き換えない", async () => {
  await setupVoice();
  expect(
    createCastTools(services(), device, new AbortController().signal, "proactive"),
  ).not.toHaveProperty("setDisplayCurrency");
  const before = await getTableState(services(), device);
  const changed = await tool(
    "setDisplayCurrency",
    { currency: "AUD" },
    { currency: null, revision: 4 },
  );
  expect(changed).toMatchObject({
    displayCurrencyAction: { currency: "AUD", revision: 4 },
    result: { displayCurrency: { currency: "AUD", status: "unavailable" } },
  });
  const after = await getTableState(services(), device);
  expect(after.cart).toEqual(before.cart);
  expect(after.snapshot).toEqual(before.snapshot);
  expect(after.voiceSessionId).toBe(before.voiceSessionId);
  await expect(
    tool("setDisplayCurrency", { currency: "XYZ" }, { currency: null, revision: 4 }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});

it("カート・確認・承認後の注文に参考額を添えても、保存する合計は円のまま", async () => {
  await setupVoice();
  const context: DisplayCurrencyContext = {
    currency: "AUD",
    revision: 0,
    rates: {
      base: "JPY",
      date: source.date,
      source: "currency-api",
      rates: { AUD: 0.00967 },
    },
  };
  const lines = [{ id: "currency-tea", productId: "tea", quantity: 2, selections: [] }];
  const cart = await tool("updateCart", { expectedVersion: 0, lines }, context);
  const saved = await getTableState(services(), device);
  const total = saved.cart.total;
  const approximate = { total: Number((total * 0.00967).toFixed(2)) };
  expect(cart.result).toMatchObject({ cart: { total, approximate } });
  const confirmation = await tool(
    "prepareConfirmation",
    { expectedVersion: saved.cart.version },
    context,
  );
  expect(confirmation.result).toMatchObject({ total, approximate });
  const { snapshotId } = z.object({ snapshotId: z.string() }).parse(confirmation.result);
  const turnId = "tablecast-currency-approval";
  await services()
    .db.insert(business.voiceTurns)
    .values({
      id: turnId,
      voice_session_id: "tablecast-currency-voice",
      table_session_id: device.tableSessionId ?? "",
      store_id: device.storeId,
      status: "started",
      started_at: Date.now() + 1,
      locale: "ja",
    });
  await services()
    .db.update(business.tableSessions)
    .set({ active_turn_id: turnId })
    .where(eq(business.tableSessions.id, device.tableSessionId ?? ""));
  const order = await tool(
    "submitOrder",
    { snapshotId, idempotencyKey: "currency-order", approved: true },
    context,
    turnId,
  );
  expect(order.result).toMatchObject({ total, approximate });
  const after = await getTableState(services(), device);
  expect(after.orders[0]?.total).toBe(total);
  expect(after.orders[0]?.snapshot.lines).toEqual(saved.cart.lines);
  expect(after.orders[0]).not.toHaveProperty("approximate");
  expect(after.cart.lines).toHaveLength(0);
});
