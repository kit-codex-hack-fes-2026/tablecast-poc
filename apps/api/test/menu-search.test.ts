import { applyD1Migrations, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { and, eq, sql } from "drizzle-orm";
import { expect, inject, it } from "vitest";
import { z } from "zod";
import app from "../src/app";
import * as business from "../src/db/business-schema";
import { getCoreState } from "../src/modules/tables/core-queries";
import { setUiSection } from "../src/modules/tables/use-cases/presentation";
import { invokeVoiceTool } from "../src/modules/voice/realtime";
import { createApiServices } from "../src/platform/context";
import { coreStateSchema } from "../src/schema";
import {
  configuration,
  device,
  deviceToken,
  resetFixtureStorage,
  setupVoiceFixture,
  text,
} from "./fixture";
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

it("0件・末尾を画面と同じ件数で返し、2000商品でも8件と出力予算を保つ", async () => {
  await setupProducts(2000);
  const measured = measuredDatabase(env.TABLECAST_DB);
  const result = await invokeVoiceTool(
    createApiServices({ ...env, TABLECAST_DB: measured.database }),
    {
      voiceSessionId: voiceId,
      turnId,
      toolCallId: crypto.randomUUID(),
      toolName: "showMenuSearch",
      arguments: { query: "検索カテゴリ", offset: 1992 },
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

it("GUIと音声の空・空白検索を拒否し、確定済みの検索ページを変更しない", async () => {
  await setupProducts();
  const before = await setUiSection(
    services(),
    device,
    { section: "menu", search: { query: "  検索カテゴリ　", offset: 8 } },
    "core",
  );
  expect(before.menuSearch?.query).toBe("検索カテゴリ");
  const uiEvents = () =>
    services()
      .db.select()
      .from(business.tableEvents)
      .where(
        and(
          eq(business.tableEvents.table_session_id, device.tableSessionId),
          eq(business.tableEvents.kind, "table.ui"),
        ),
      );
  const beforeEvents = await uiEvents();
  const context = createExecutionContext();
  try {
    for (const query of ["", "   ", "　", "\t\n"]) {
      const beforeRequest = await getCoreState(services(), device);
      const response = await app.request(
        "/api/table/ui?view=core",
        {
          method: "PATCH",
          headers: {
            Cookie: `tablecast.device=${deviceToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ section: "menu", search: { query } }),
        },
        env,
        context,
      );
      expect(response.status).toBe(422);
      expect((await getCoreState(services(), device)).cursor).toBe(beforeRequest.cursor);
      await expect(tool("showMenuSearch", { query })).rejects.toThrow("INVALID_INPUT");
      const after = await getCoreState(services(), device);
      expect(after.menuSearch).toEqual(before.menuSearch);
      expect(after.uiSection).toBe(before.uiSection);
    }
    // 音声ツールの失敗記録は残すが、検索表示を更新するイベントは増やさない。
    expect(await uiEvents()).toEqual(beforeEvents);
  } finally {
    await waitOnExecutionContext(context);
  }
});

it("旧保存の空・空白検索を通常一覧として読み、カートと保存済みの値を保つ", async () => {
  await setupProducts();
  const before = await getCoreState(services(), device);
  for (const query of ["", "　 \t"]) {
    const saved = JSON.stringify({ query, offset: 8, configVersion: before.configVersion });
    await services()
      .db.update(business.tableSessions)
      .set({ menu_search_json: saved })
      .where(eq(business.tableSessions.id, device.tableSessionId));
    const state = await getCoreState(services(), device);
    expect(state.menuSearch).toBeNull();
    expect(state.cart).toEqual(before.cart);
    const row = await services()
      .db.select({ search: business.tableSessions.menu_search_json })
      .from(business.tableSessions)
      .where(eq(business.tableSessions.id, device.tableSessionId))
      .get();
    expect(row?.search).toBe(saved);
  }
});

it("検索条件を別店舗・閉卓・停止済みturnから更新できず、不正入力を保存しない", async () => {
  await setupProducts();
  await expect(
    setUiSection(
      services(),
      { ...device, storeId: "tablecast-other-store" },
      { section: "menu", search: { query: "検索カテゴリ" } },
      "core",
    ),
  ).rejects.toThrow("TABLE_NOT_FOUND");
  await expect(
    setUiSection(
      services(),
      device,
      { section: "cart", search: { query: "検索カテゴリ" } },
      "core",
    ),
  ).rejects.toThrow("INVALID_INPUT");
  await expect(tool("showMenuSearch", { query: "a".repeat(101) })).rejects.toThrow("INVALID_INPUT");
  expect((await getCoreState(services(), device)).menuSearch).toBeNull();
  await services()
    .db.update(business.tableSessions)
    .set({ voice_state: "stopped", active_turn_id: null })
    .where(eq(business.tableSessions.id, device.tableSessionId));
  await expect(tool("showMenuSearch", { query: "検索カテゴリ" })).rejects.toThrow(
    "VOICE_SESSION_STALE",
  );
  await services()
    .db.update(business.tableSessions)
    .set({ status: "closed" })
    .where(eq(business.tableSessions.id, device.tableSessionId));
  await expect(
    setUiSection(
      services(),
      device,
      { section: "menu", search: { query: "検索カテゴリ" } },
      "core",
    ),
  ).rejects.toThrow("SESSION_CLOSED");
});

it("検索列を追加しても既存セッションのカートと状態を変えず、検索条件をNULLで開始する", async () => {
  await resetFixtureStorage();
  const migrations = inject("tablecastMigrations");
  const index = migrations.findIndex((migration) =>
    migration.name.includes("0031_tablecast_menu_search"),
  );
  if (index < 1) throw new Error("検索条件のmigrationが必要です");
  await applyD1Migrations(env.TABLECAST_DB, migrations.slice(0, index));
  // 移行前には新列がないため、旧列だけを明示してfixtureを保存する。
  await services().db.run(
    sql`INSERT INTO organization(id,name,slug,created_at) VALUES ('tablecast-search-migration-org','検索移行','tablecast-search-migration',1)`,
  );
  await services()
    .db.insert(business.stores)
    .values({
      id: "tablecast-search-migration-store",
      organization_id: "tablecast-search-migration-org",
      name: "検索移行",
      config_json: JSON.stringify(configuration),
      updated_at: 1,
    });
  await services().db.insert(business.restaurantTables).values({
    id: "tablecast-search-migration-table",
    store_id: "tablecast-search-migration-store",
    name: "01",
  });
  await services().db.run(
    sql`INSERT INTO table_sessions(id,store_id,table_id,locale,guest_count,opened_at,cart_json) VALUES ('tablecast-search-migration-session','tablecast-search-migration-store','tablecast-search-migration-table','ja',2,123,'[]')`,
  );
  await applyD1Migrations(env.TABLECAST_DB, migrations.slice(index));
  const row = await services()
    .db.select()
    .from(business.tableSessions)
    .where(eq(business.tableSessions.id, "tablecast-search-migration-session"))
    .get();
  expect(row).toMatchObject({
    cart_json: "[]",
    status: "open",
    locale: "ja",
    opened_at: 123,
    menu_search_json: null,
  });
});
