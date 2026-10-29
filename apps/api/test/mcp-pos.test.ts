import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { member } from "../src/db/identity-schema";
import { posConnections } from "../src/db/pos-schema";
import { stores } from "../src/db/table-schema";
import { posMappingSchema, posSettingsSchema } from "../src/modules/pos/model";
import { fixtureDb } from "./database-fixture";
import { configuration, setupFixture } from "./fixture";
import {
  authorisePos,
  connectPos,
  posCatalogHttp,
  posToolData,
  posToolError,
} from "./mcp-pos-fixture";
import {
  checkoutPath,
  configured,
  deviceId,
  request,
  setupPosFixture,
  squareHttp,
} from "./pos-fixture";

afterEach(() => vi.restoreAllMocks());

const localPage = z.object({
  connection: posSettingsSchema.shape.connection,
  configured: z.boolean(),
  storeId: z.string(),
  settingsUrl: z.string(),
  section: z.enum(["items", "mappings"]),
  total: z.number(),
  nextCursor: z.string().nullable(),
  items: z.array(
    z.object({
      kind: z.enum(["product", "option"]),
      id: z.string(),
      productId: z.string().nullable(),
      name: z.object({ ja: z.string(), en: z.string() }),
      price: z.number(),
      available: z.boolean().nullable(),
    }),
  ),
  mappings: z.array(posMappingSchema),
});
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
const mappings = [
  { kind: "product", localId: "tea", externalId: "square-tea" },
  { kind: "product", localId: "coffee", externalId: "square-coffee" },
  { kind: "option", localId: "dairy", externalId: "square-dairy" },
  { kind: "option", localId: "oat", externalId: "square-oat" },
] satisfies z.infer<typeof posMappingSchema>[];

it("未接続の状態と設定GUIを読取りscopeで返し、保存scopeと現行roleをMCPで検証する", async () => {
  const { cookie } = await setupFixture();
  const token = await authorisePos(cookie, "tablecast:read");
  const client = await connectPos(token);
  const outgoing = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("外部要求は不要"));
  const page = posToolData(
    await client.callTool({ name: "get_pos_settings", arguments: { limit: 1 } }),
    localPage,
  );
  expect(page).toMatchObject({
    configured: false,
    connection: null,
    storeId: "tablecast-store",
    settingsUrl: "http://localhost:3000/admin/stores/tablecast-store/pos",
    total: 4,
  });
  expect(page.items).toHaveLength(1);
  expect(page.nextCursor).not.toBeNull();
  const tools = (await client.listTools()).tools;
  for (const name of ["get_pos_settings", "get_pos_catalog", "list_pos_devices"])
    expect(tools.find((tool) => tool.name === name)?.annotations?.readOnlyHint).toBe(true);
  expect(tools.find((tool) => tool.name === "save_pos_mappings")?.annotations?.readOnlyHint).toBe(
    false,
  );
  for (const name of ["start_pos_checkout", "disconnect_pos", "start_pos_oauth"])
    expect(tools.map((tool) => tool.name)).not.toContain(name);
  posToolError(
    await client.callTool({ name: "get_pos_catalog", arguments: {} }),
    "POS_CONNECTION_REQUIRED",
  );
  posToolError(
    await client.callTool({ name: "list_pos_devices", arguments: {} }),
    "POS_CONNECTION_REQUIRED",
  );
  posToolError(
    await client.callTool({
      name: "save_pos_mappings",
      arguments: { expectedRevision: 0, locationId: "square-location", deviceId, mappings },
    }),
    "WRITE_SCOPE_REQUIRED",
  );
  await fixtureDb.update(member).set({ role: "member" }).where(eq(member.id, "tablecast-member"));
  for (const name of ["get_pos_settings", "get_pos_catalog", "list_pos_devices"])
    posToolError(await client.callTool({ name, arguments: {} }), "ADMIN_REQUIRED");
  expect((await request("/api/admin/stores/tablecast-store/pos", cookie)).status).toBe(200);
  expect(outgoing).not.toHaveBeenCalled();
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

it("日英の全商品・全選択肢と既存対応をページ回収し、Squareの原文・親候補・価格を保持する", async () => {
  const { cookie } = await setupPosFixture();
  await fixtureDb.update(posConnections).set({ mappingsJson: JSON.stringify(mappings) });
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
  expect(devices).toEqual({
    devices: [{ id: deviceId, name: "レジ端末", locationId: "square-location" }],
    total: 1,
    nextCursor: null,
    canPair: false,
  });
});

it("書込scopeで全対応を保存し、古いrevision・無効ID・所属外店舗を拒否する", async () => {
  const { cookie, staff } = await setupPosFixture();
  const token = await authorisePos(cookie);
  const client = await connectPos(token, configured());
  posCatalogHttp();
  const input = { expectedRevision: 1, locationId: "square-location", deviceId, mappings };
  const saved = posToolData(
    await client.callTool({ name: "save_pos_mappings", arguments: input }),
    z.object({
      connection: posSettingsSchema.shape.connection,
      mappingCount: z.number(),
      storeId: z.string(),
      settingsUrl: z.string(),
    }),
  );
  expect(saved).toMatchObject({ connection: { revision: 2 }, mappingCount: 4 });
  const row = await fixtureDb.select().from(posConnections).get();
  expect(JSON.parse(row?.mappingsJson ?? "[]")).toEqual(mappings);
  expect(JSON.stringify(saved)).not.toContain("tablecast-square-access-token");
  expect(JSON.stringify(saved)).not.toContain(row?.credentials);
  posToolError(
    await client.callTool({ name: "save_pos_mappings", arguments: input }),
    "POS_VERSION_CONFLICT",
  );
  posToolError(
    await client.callTool({
      name: "save_pos_mappings",
      arguments: {
        ...input,
        expectedRevision: 2,
        mappings: [{ kind: "product", localId: "tea", externalId: "missing" }],
      },
    }),
    "POS_MAPPING_REQUIRED",
  );
  expect(await fixtureDb.select().from(posConnections).get()).toEqual(row);
  await fixtureDb.batch([
    fixtureDb.insert(member).values({
      id: "tablecast-other-pos-admin",
      organizationId: "tablecast-fixture-other-org",
      userId: staff.userId,
      role: "owner",
      createdAt: new Date(),
    }),
    fixtureDb.insert(stores).values({
      id: "tablecast-other-pos-store",
      organization_id: "tablecast-fixture-other-org",
      name: "他店舗",
      config_json: JSON.stringify(configuration),
      updated_at: Date.now(),
    }),
  ]);
  await expect(connectPos(token, configured(), "tablecast-other-pos-store")).rejects.toMatchObject({
    code: 403,
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

it("MCP保存でも処理中の会計と対応付けを変更しない", async () => {
  const { cookie, table } = await setupPosFixture();
  const client = await connectPos(await authorisePos(cookie), configured());
  squareHttp();
  const started = await request(checkoutPath + "/start", cookie, "POST", {
    expectedVersion: table.cart.version,
    idempotencyKey: "tablecast-mcp-pos-lock",
  });
  expect(started.status).toBe(200);
  const before = await fixtureDb.select().from(posConnections).get();
  posToolError(
    await client.callTool({
      name: "save_pos_mappings",
      arguments: {
        expectedRevision: 1,
        locationId: "square-location",
        deviceId,
        mappings: [{ kind: "product", localId: "tea", externalId: "square-tea" }],
      },
    }),
    "POS_VERSION_CONFLICT",
  );
  expect(await fixtureDb.select().from(posConnections).get()).toEqual(before);
});
