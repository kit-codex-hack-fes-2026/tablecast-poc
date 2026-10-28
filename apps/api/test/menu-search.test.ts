import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { z } from "zod";
import app from "../src/app";
import * as business from "../src/db/business-schema";
import { getCoreState } from "../src/modules/tables/core-queries";
import { setUiSection } from "../src/modules/tables/use-cases/presentation";
import { invokeVoiceTool } from "../src/modules/voice/realtime";
import { createApiServices } from "../src/platform/context";
import { coreStateSchema } from "../src/schema";
import { configuration, device, deviceToken, setupVoiceFixture, text } from "./fixture";
import { measuredDatabase } from "./measured-database";

const services = () => createApiServices(env);
const voiceId = "tablecast-search-voice";
const turnId = "tablecast-search-turn";
const tool = (
  toolName: "getCatalog" | "getTableState" | "showMenuSearch",
  args: Record<string, unknown>,
) =>
  invokeVoiceTool(
    services(),
    {
      voiceSessionId: voiceId,
      turnId,
      toolCallId: crypto.randomUUID(),
      toolName,
      arguments: args,
    },
    new AbortController().signal,
  );

async function setupProducts(size = 17) {
  await setupVoiceFixture(voiceId, turnId);
  const product = configuration.products[0];
  if (!product) throw new Error("商品fixtureがありません");
  const next = {
    ...configuration,
    categories: [
      { id: "tablecast-search-category", text: text("検索カテゴリ", "Search category") },
    ],
    products: Array.from({ length: size }, (_, index) => ({
      ...product,
      id: `tablecast-search-${index}`,
      categoryId: "tablecast-search-category",
      price: 500 + index,
      available: index !== 8,
      text: text(`検索商品${index}`, `Search item ${index}`),
    })),
  };
  await services()
    .db.update(business.stores)
    .set({ config_json: JSON.stringify(next), config_version: 4 })
    .where(eq(business.stores.id, device.storeId));
}

it("GUI・検索照会・検索画面ツールが同じ8件の順序・価格・版を返し、詳細とカートから復元する", async () => {
  await setupProducts();
  const context = createExecutionContext();
  try {
    const response = await app.request(
      "/api/table/ui?view=core",
      {
        method: "PATCH",
        headers: { Cookie: `tablecast.device=${deviceToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ section: "menu", search: { query: "検索カテゴリ", offset: 8 } }),
      },
      env,
      context,
    );
    expect(response.status).toBe(200);
    const gui = coreStateSchema.parse(await response.json());
    const ids = Array.from({ length: 8 }, (_, index) => `tablecast-search-${index + 8}`);
    expect(gui.menuSearch).toEqual({
      query: "検索カテゴリ",
      offset: 8,
      total: 17,
      more: true,
      productIds: ids,
    });
    const pageSchema = z.object({
      version: z.number(),
      total: z.number(),
      more: z.boolean(),
      products: z.array(z.object({ id: z.string(), price: z.number(), available: z.boolean() })),
    });
    const read = pageSchema.parse(
      (await tool("getCatalog", { query: "検索カテゴリ", offset: 8 })).result,
    );
    const shown = pageSchema.parse(
      (await tool("showMenuSearch", { query: "検索カテゴリ", offset: 8 })).result,
    );
    expect(shown).toEqual(read);
    expect(shown.products.map((product) => product.id)).toEqual(ids);
    expect(shown.products[0]).toEqual({ id: "tablecast-search-8", price: 508, available: false });
    expect(shown.version).toBe(gui.configVersion);
    for (const input of [
      { section: "menu", productId: "tablecast-search-9" },
      { section: "cart" },
      { section: "menu" },
    ] as const) {
      const state = await setUiSection(services(), device, input, "core");
      expect(state.menuSearch).toEqual(gui.menuSearch);
    }
    expect((await tool("getTableState", {})).result).toMatchObject({ menuSearch: gui.menuSearch });
    expect((await getCoreState(services(), device)).menuSearch).toEqual(gui.menuSearch);
    expect(
      (await setUiSection(services(), device, { section: "menu", search: null }, "core"))
        .menuSearch,
    ).toBeNull();
  } finally {
    await waitOnExecutionContext(context);
  }
});

it("カタログ更新では検索語を保って先頭ページの新しい価格と版へ切り替える", async () => {
  await setupProducts();
  await tool("showMenuSearch", { query: "検索カテゴリ", offset: 8 });
  const store = await services()
    .db.select()
    .from(business.stores)
    .where(eq(business.stores.id, device.storeId))
    .get();
  if (!store) throw new Error("店舗fixtureがありません");
  await services()
    .db.update(business.stores)
    .set({ config_version: 5 })
    .where(eq(business.stores.id, device.storeId));
  const state = await getCoreState(services(), device);
  expect(state.configVersion).toBe(5);
  expect(state.menuSearch).toMatchObject({
    query: "検索カテゴリ",
    offset: 0,
    productIds: [
      "tablecast-search-0",
      "tablecast-search-1",
      "tablecast-search-2",
      "tablecast-search-3",
      "tablecast-search-4",
      "tablecast-search-5",
      "tablecast-search-6",
      "tablecast-search-7",
    ],
  });
});

it("空検索・0件・末尾を画面と同じ件数で返し、2000商品でも8件と出力予算を保つ", async () => {
  await setupProducts(2000);
  const measured = measuredDatabase(env.TABLECAST_DB);
  const result = await invokeVoiceTool(
    createApiServices({ ...env, TABLECAST_DB: measured.database }),
    {
      voiceSessionId: voiceId,
      turnId,
      toolCallId: crypto.randomUUID(),
      toolName: "showMenuSearch",
      arguments: { query: "", offset: 1992 },
    },
    new AbortController().signal,
  );
  expect(result.result).toMatchObject({ offset: 1992, total: 2000, more: false });
  expect(result.result).toHaveProperty("products.length", 8);
  expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThan(6000);
  expect(measured.stats.roundtrips).toBeLessThanOrEqual(5);
  expect((await tool("showMenuSearch", { query: "zxqv未登録" })).result).toMatchObject({
    total: 0,
    more: false,
    productIds: [],
    products: [],
  });
});

it("検索条件を別店舗・閉卓・停止済みturnから更新できず、不正入力を保存しない", async () => {
  await setupProducts();
  await expect(
    setUiSection(
      services(),
      { ...device, storeId: "tablecast-other-store" },
      { section: "menu", search: { query: "" } },
      "core",
    ),
  ).rejects.toThrow("TABLE_NOT_FOUND");
  await expect(
    setUiSection(services(), device, { section: "cart", search: { query: "" } }, "core"),
  ).rejects.toThrow("INVALID_INPUT");
  await expect(tool("showMenuSearch", { query: "a".repeat(101) })).rejects.toThrow("INVALID_INPUT");
  expect((await getCoreState(services(), device)).menuSearch).toBeNull();
  await services()
    .db.update(business.tableSessions)
    .set({ voice_state: "stopped", active_turn_id: null })
    .where(eq(business.tableSessions.id, device.tableSessionId));
  await expect(tool("showMenuSearch", { query: "" })).rejects.toThrow("VOICE_SESSION_STALE");
  await services()
    .db.update(business.tableSessions)
    .set({ status: "closed" })
    .where(eq(business.tableSessions.id, device.tableSessionId));
  await expect(
    setUiSection(services(), device, { section: "menu", search: { query: "" } }, "core"),
  ).rejects.toThrow("SESSION_CLOSED");
});
