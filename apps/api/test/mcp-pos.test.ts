import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { posConnections } from "../src/db/pos-schema";
import { stores } from "../src/db/table-schema";
import { configurationSchema } from "../src/modules/configuration/model";
import { createDraft } from "../src/modules/configuration/use-cases/drafts";
import { type posMappingSchema, posSettingsSchema } from "../src/modules/pos/model";
import { fixtureDb } from "./database-fixture";
import { configuration, setupFixture } from "./fixture";
import {
  authorisePos,
  connectPos,
  posLocalPage as localPage,
  posMappings as mappings,
  posCatalogHttp,
  posToolData,
  posToolError,
} from "./mcp-pos-fixture";
import { configured, deviceId, posConfiguration, request, setupPosFixture } from "./pos-fixture";

afterEach(() => vi.restoreAllMocks());

const remoteEntry = z.object({
  kind: z.enum(["location", "product", "option"]),
  id: z.string(),
  name: z.string(),
  productId: z.string().optional(),
  itemName: z.string().nullable().optional(),
  variationName: z.string().nullable().optional(),
  price: z.number().nullable().optional(),
});
const catalogPage = z.object({
  total: z.number(),
  nextCursor: z.string().nullable(),
  entries: z.array(remoteEntry),
});
it("一商品の大量選択肢も既定50件・最大100件のページで親IDと価格を落とさない", async () => {
  const { cookie } = await setupFixture();
  const config = structuredClone(configuration);
  const coffee = config.products.find((product) => product.id === "coffee");
  const group = coffee?.modifiers[0];
  const option = group?.options[0];
  if (!coffee || !group || !option) throw new Error("選択肢fixtureがありません");
  coffee.modifiers = Array.from({ length: 4 }, (_group, groupIndex) => ({
    ...group,
    id: `mcp-group-${groupIndex}`,
    options: Array.from({ length: 30 }, (_option, index) => ({
      ...option,
      id: `mcp-option-${groupIndex}-${index}`,
      priceDelta: groupIndex * 30 + index,
    })),
  }));
  await fixtureDb
    .update(stores)
    .set({ config_json: JSON.stringify(config) })
    .where(eq(stores.id, "tablecast-store"));
  const client = await connectPos(await authorisePos(cookie, "tablecast:read"));
  const first = posToolData(
    await client.callTool({ name: "get_pos_settings", arguments: {} }),
    localPage,
  );
  expect(first.total).toBe(122);
  expect(first.items).toHaveLength(50);
  const second = posToolData(
    await client.callTool({
      name: "get_pos_settings",
      arguments: { limit: 100, cursor: first.nextCursor },
    }),
    localPage,
  );
  expect(second.total).toBe(122);
  expect(second.items).toHaveLength(72);
  expect(second.nextCursor).toBeNull();
  const items = [...first.items, ...second.items];
  expect(new Set(items.map((item) => item.id)).size).toBe(122);
  expect(items.filter((item) => item.kind === "option")).toHaveLength(120);
  expect(items.find((item) => item.id === "mcp-option-3-29")).toMatchObject({
    productId: "coffee",
    price: 119,
  });
});

it("旧live対応は明示取込sectionからページ回収し、下書きへだけ取り込む", async () => {
  const { cookie, staff, services } = await setupPosFixture();
  await fixtureDb.batch([
    fixtureDb
      .update(stores)
      .set({ config_json: JSON.stringify(configuration) })
      .where(eq(stores.id, staff.storeId)),
    fixtureDb.update(posConnections).set({ mappingsJson: JSON.stringify(mappings) }),
  ]);
  const client = await connectPos(await authorisePos(cookie), configured());
  const published = posToolData(
    await client.callTool({ name: "get_pos_settings", arguments: { section: "mappings" } }),
    localPage,
  );
  expect(published.mappings).toEqual([]);
  const first = posToolData(
    await client.callTool({
      name: "get_pos_settings",
      arguments: { section: "legacyMappings", limit: 2 },
    }),
    localPage,
  );
  expect(first.total).toBe(4);
  expect(first.mappings).toHaveLength(2);
  const second = posToolData(
    await client.callTool({
      name: "get_pos_settings",
      arguments: { section: "legacyMappings", limit: 2, cursor: first.nextCursor },
    }),
    localPage,
  );
  const recovered = [...first.mappings, ...second.mappings];
  expect(recovered).toHaveLength(4);
  expect(second.nextCursor).toBeNull();
  const draft = await createDraft(services, staff);
  posCatalogHttp();
  posToolData(
    await client.callTool({
      name: "save_pos_mappings",
      arguments: {
        draftId: draft.id,
        expectedVersion: draft.version,
        connectionId: posConfiguration.pos.connectionId,
        mappings: recovered,
      },
    }),
    z.object({ draft: posSettingsSchema.shape.draft }),
  );
  expect(
    configurationSchema.parse(
      JSON.parse(
        (await fixtureDb.select().from(stores).where(eq(stores.id, staff.storeId)).get())
          ?.config_json ?? "{}",
      ),
    ).pos,
  ).toBeUndefined();
});

it("日英の全商品・全選択肢と既存対応をページ回収し、Squareの原文・親候補・価格を保持する", async () => {
  const { cookie } = await setupPosFixture();
  await fixtureDb.update(stores).set({
    config_json: JSON.stringify({
      ...posConfiguration,
      pos: { ...posConfiguration.pos, mappings },
    }),
  });
  const client = await connectPos(await authorisePos(cookie), configured());
  posCatalogHttp();
  let cursor: null | string = null;
  const items: z.infer<typeof localPage>["items"] = [];
  for (let index = 0; index < 2; index++) {
    const page: z.infer<typeof localPage> = posToolData(
      await client.callTool({
        name: "get_pos_settings",
        arguments: { limit: 2, ...(cursor ? { cursor } : {}) },
      }),
      localPage,
    );
    expect(page.total).toBe(4);
    expect(page.items).toHaveLength(2);
    expect(page.mappings).toEqual([]);
    items.push(...page.items);
    cursor = page.nextCursor;
  }
  expect(cursor).toBeNull();
  expect(items).toEqual(
    expect.arrayContaining([
      {
        kind: "product",
        id: "tea",
        productId: null,
        name: { ja: "ほうじ茶", en: "Roasted green tea" },
        price: 400,
        available: true,
      },
      {
        kind: "option",
        id: "oat",
        productId: "coffee",
        name: { ja: "オーツミルク", en: "Oat milk" },
        price: 100,
        available: null,
      },
    ]),
  );
  const recovered: z.infer<typeof posMappingSchema>[] = [];
  for (let index = 0; index < 2; index++) {
    const page = posToolData(
      await client.callTool({
        name: "get_pos_settings",
        arguments: { section: "mappings", limit: 2, ...(cursor ? { cursor } : {}) },
      }),
      localPage,
    );
    expect(page.items).toEqual([]);
    expect(page.total).toBe(4);
    recovered.push(...page.mappings);
    cursor = page.nextCursor;
  }
  expect(cursor).toBeNull();
  expect(recovered).toHaveLength(4);
  expect(recovered).toEqual(expect.arrayContaining(mappings));
  const entries: z.infer<typeof remoteEntry>[] = [];
  for (let index = 0; index < 3; index++) {
    const page = posToolData(
      await client.callTool({
        name: "get_pos_catalog",
        arguments: { locationId: "square-location", limit: 2, ...(cursor ? { cursor } : {}) },
      }),
      catalogPage,
    );
    expect(page.total).toBe(5);
    expect(page.entries.length).toBeLessThanOrEqual(2);
    entries.push(...page.entries);
    cursor = page.nextCursor;
  }
  expect(cursor).toBeNull();
  expect(entries).toHaveLength(5);
  expect(entries).toEqual(
    expect.arrayContaining([
      {
        kind: "product",
        id: "square-tea",
        name: "煎茶 原名 / 標準 / 店舗限定",
        itemName: "煎茶 原名",
        variationName: "標準 / 店舗限定",
        price: 400,
      },
      { kind: "option", id: "square-oat", productId: "square-coffee", name: "燕麥奶", price: 100 },
    ]),
  );
  const devices = posToolData(
    await client.callTool({
      name: "list_pos_devices",
      arguments: { locationId: "square-location", limit: 1 },
    }),
    z.object({
      devices: z.array(z.object({ id: z.string(), name: z.string(), locationId: z.string() })),
      total: z.number(),
      nextCursor: z.string().nullable(),
      canPair: z.boolean(),
    }),
  );
  expect(devices).toMatchObject({
    devices: [
      {
        id: "0a956d49-619a-4530-8e5e-8eac603ffc5e",
        name: "Square Terminal (0a956d49)",
        locationId: "square-location",
      },
    ],
    total: 4,
    canPair: false,
  });
  expect(devices.nextCursor).not.toBeNull();
});

it("MCPと設定HTTPは英語が未翻訳でも登録済みの韓国語・中国語名を落とさない", async () => {
  const { cookie } = await setupPosFixture();
  const config = structuredClone(configuration);
  const product = config.products.find((value) => value.id === "coffee");
  const option = product?.modifiers[0]?.options.find((value) => value.id === "oat");
  if (!product || !option) throw new Error("多言語商品のfixtureがありません");
  delete product.text.en;
  product.text.ko = { ...product.text.ja, displayName: "카페라테", transliteration: "Kape latte" };
  product.text["zh-Hans"] = { ...product.text.ja, displayName: "拿铁", transliteration: "Na tie" };
  delete option.text.en;
  option.text.ko = { ...option.text.ja, displayName: "귀리 우유" };
  option.text["zh-Hans"] = { ...option.text.ja, displayName: "燕麦奶" };
  await fixtureDb
    .update(stores)
    .set({ config_json: JSON.stringify(config) })
    .where(eq(stores.id, "tablecast-store"));
  const client = await connectPos(await authorisePos(cookie, "tablecast:read"), configured());
  const page = posToolData(
    await client.callTool({ name: "get_pos_settings", arguments: {} }),
    localPage,
  );
  expect(page.items.find((item) => item.id === "coffee")?.name).toEqual({
    ja: "カフェラテ",
    ko: "카페라테",
    "zh-Hans": "拿铁",
  });
  expect(page.items.find((item) => item.id === "oat")?.name).toEqual({
    ja: "オーツミルク",
    ko: "귀리 우유",
    "zh-Hans": "燕麦奶",
  });
  const response = await request("/api/admin/stores/tablecast-store/pos", cookie);
  expect(response.status).toBe(200);
  const settings = posSettingsSchema.parse(await response.json());
  expect(settings.products.find((item) => item.id === "coffee")?.name).toEqual({
    ja: "カフェラテ",
    ko: "카페라테",
    "zh-Hans": "拿铁",
  });
});

it("ページ途中の変更・別sectionのcursor・過大limitを拒否して欠落を防ぐ", async () => {
  const { cookie } = await setupPosFixture();
  const client = await connectPos(await authorisePos(cookie), configured());
  const first = posToolData(
    await client.callTool({ name: "get_pos_settings", arguments: { limit: 1 } }),
    localPage,
  );
  posToolError(
    await client.callTool({
      name: "get_pos_settings",
      arguments: { section: "mappings", cursor: first.nextCursor },
    }),
    "POS_CURSOR_STALE",
  );
  await fixtureDb.update(posConnections).set({ revision: 2 });
  posToolError(
    await client.callTool({ name: "get_pos_settings", arguments: { cursor: first.nextCursor } }),
    "POS_CURSOR_STALE",
  );
  posToolError(
    await client.callTool({ name: "get_pos_settings", arguments: { cursor: "invalid" } }),
    "POS_CURSOR_INVALID",
  );
  expect(
    (await client.callTool({ name: "get_pos_settings", arguments: { limit: 101 } })).isError,
  ).toBe(true);
  expect(
    (
      await client.callTool({
        name: "save_pos_mappings",
        arguments: { locationId: "square-location", deviceId, mappings },
      })
    ).isError,
  ).toBe(true);
});
