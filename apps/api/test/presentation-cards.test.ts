import { env } from "cloudflare:workers";
import { afterEach, expect, it, vi } from "vitest";
import type { Actor } from "../src/modules/auth/model";
import * as businessTables from "../src/db/business-schema";
import { getEvents } from "../src/modules/stores/queries";
import { getTableState } from "../src/modules/tables/queries";
import { closeTable } from "../src/modules/tables/use-cases/lifecycle";
import { setUiSection, showProducts } from "../src/modules/tables/use-cases/presentation";
import { recordVoiceEvent, setSpeechSpeed, setVoiceSession } from "../src/modules/voice/service";
import { createApiServices } from "../src/platform/context";
import { insertFixture } from "./database-fixture";
import { configuration, device, setupFixture } from "./fixture";

afterEach(() => vi.restoreAllMocks());

const voice = {
  ...device,
  kind: "voice",
  voiceSessionId: "tablecast-presentation-voice",
  turnId: "tablecast-presentation-turn",
} satisfies Actor;

async function setupVoice() {
  const fixture = await setupFixture();
  await setVoiceSession(createApiServices(env), device, voice.voiceSessionId);
  await env.TABLECAST_DB.batch([
    env.TABLECAST_DB.prepare("UPDATE table_sessions SET active_turn_id=? WHERE id=?").bind(
      voice.turnId,
      device.tableSessionId,
    ),
    insertFixture(businessTables.voiceTurns, {
      id: voice.turnId,
      voice_session_id: voice.voiceSessionId,
      table_session_id: voice.tableSessionId,
      store_id: voice.storeId,
      status: "started",
      started_at: Date.now(),
    }),
  ]);
  return fixture;
}

it("実行中の音声ツールイベントは保存し、音声停止後の遅延イベントは保存しない", async () => {
  await setupVoice();
  const cursor = (await getEvents(createApiServices(env), device)).cursor;

  expect(
    await recordVoiceEvent(createApiServices(env), voice, {
      kind: "voice.tool",
      data: { toolCallId: "tablecast-tool-call", toolName: "getCatalog", state: "running" },
    }),
  ).toBe(true);
  expect((await getEvents(createApiServices(env), device, cursor)).events).toMatchObject([
    {
      storeId: voice.storeId,
      tableSessionId: voice.tableSessionId,
      kind: "voice.tool",
      data: {
        turnId: voice.turnId,
        toolCallId: "tablecast-tool-call",
        toolName: "getCatalog",
        state: "running",
      },
    },
  ]);
  await setVoiceSession(createApiServices(env), device, null);
  const stopped = await getEvents(createApiServices(env), device);

  expect(
    await recordVoiceEvent(createApiServices(env), voice, {
      kind: "voice.tool",
      data: { toolCallId: "tablecast-tool-call", toolName: "getCatalog", state: "completed" },
    }),
  ).toBe(false);
  expect(await getEvents(createApiServices(env), device)).toEqual(stopped);
});

it.each(["音声停止", "古いturn", "古い音声セッション", "別卓", "別店舗", "閉卓"])(
  "%sの音声からは表示変更も商品カードも追加されない",
  async (condition) => {
    const { staff } = await setupVoice();
    if (condition === "音声停止") await setVoiceSession(createApiServices(env), device, null);
    if (condition === "閉卓") await closeTable(createApiServices(env), staff);
    if (condition === "別卓")
      await env.TABLECAST_DB.batch([
        insertFixture(businessTables.restaurantTables, {
          id: "tablecast-other-table",
          store_id: "tablecast-store",
          name: "02",
        }),
        insertFixture(businessTables.tableSessions, {
          id: "tablecast-other-session",
          store_id: "tablecast-store",
          table_id: "tablecast-other-table",
          locale: "ja",
          guest_count: 2,
          opened_at: Date.now(),
          voice_state: "active",
          voice_session_id: "tablecast-other-voice",
          active_turn_id: "tablecast-other-turn",
        }),
      ]);
    if (condition === "別店舗")
      await insertFixture(businessTables.stores, {
        id: "tablecast-other-store",
        organization_id: "tablecast-fixture-other-org",
        name: "別店舗",
        config_json: JSON.stringify(configuration),
        updated_at: Date.now(),
      }).run();
    const actor: Actor = {
      ...voice,
      ...(condition === "古いturn" ? { turnId: "tablecast-old-turn" } : {}),
      ...(condition === "古い音声セッション" ? { voiceSessionId: "tablecast-old-voice" } : {}),
      ...(condition === "別卓" ? { tableSessionId: "tablecast-other-session" } : {}),
      ...(condition === "別店舗" ? { storeId: "tablecast-other-store" } : {}),
    };
    const before = await getTableState(createApiServices(env), staff);
    const code = condition === "別店舗" ? "TABLE_NOT_FOUND" : "VOICE_SESSION_STALE";

    await expect(
      setUiSection(createApiServices(env), actor, { section: "menu", productId: "tea" }),
    ).rejects.toMatchObject({ code });
    await expect(
      setSpeechSpeed(createApiServices(env), actor, { speed: 1.2 }),
    ).rejects.toMatchObject({ code });
    await expect(
      showProducts(createApiServices(env), actor, { productIds: ["tea"] }),
    ).rejects.toMatchObject({ code });

    expect(await getTableState(createApiServices(env), staff)).toEqual(before);
  },
);

it.each([
  { condition: "1商品", productIds: ["tea"], expected: ["tea"] },
  {
    condition: "上限4商品",
    productIds: ["tea", "coffee", "water", "juice"],
    expected: ["tea", "coffee", "water", "juice"],
  },
  {
    condition: "重複を含む商品",
    productIds: ["tea", "coffee", "tea"],
    expected: ["tea", "coffee"],
  },
])(
  "$conditionは順序を保つカードイベントとして現在のturnへ保存する",
  async ({ productIds, expected }) => {
    await setupVoice();
    const tea = configuration.products.find((product) => product.id === "tea");
    if (!tea) throw new Error("ほうじ茶のfixtureがありません");
    await env.TABLECAST_DB.prepare("UPDATE stores SET config_json=? WHERE id=?")
      .bind(
        JSON.stringify({
          ...configuration,
          products: [...configuration.products, { ...tea, id: "water" }, { ...tea, id: "juice" }],
        }),
        device.storeId,
      )
      .run();
    const before = await getTableState(createApiServices(env), device);
    const cursor = (await getEvents(createApiServices(env), device)).cursor;

    expect(await showProducts(createApiServices(env), voice, { productIds })).toEqual({
      productIds: expected,
    });

    expect((await getEvents(createApiServices(env), device, cursor)).events).toMatchObject([
      {
        storeId: device.storeId,
        tableSessionId: device.tableSessionId,
        kind: "voice.products",
        data: { turnId: voice.turnId, productIds: expected },
      },
    ]);
    const after = await getTableState(createApiServices(env), device);
    expect(after.cart).toEqual(before.cart);
    expect(after.uiSection).toBe(before.uiSection);
  },
);

it("売切商品の情報カードも表示でき、注文可能とは扱わない", async () => {
  await setupVoice();
  await env.TABLECAST_DB.prepare("UPDATE stores SET config_json=? WHERE id=?")
    .bind(
      JSON.stringify({
        ...configuration,
        products: configuration.products.map((product) => ({ ...product, available: false })),
      }),
      device.storeId,
    )
    .run();

  expect(await showProducts(createApiServices(env), voice, { productIds: ["tea"] })).toEqual({
    productIds: ["tea"],
  });
  expect((await getTableState(createApiServices(env), device)).cart.lines).toEqual([]);
});

it("未知の商品と別店舗だけに存在する商品をカードへ含める要求は全体を拒否する", async () => {
  await setupVoice();
  await insertFixture(businessTables.stores, {
    id: "tablecast-other-store",
    organization_id: "tablecast-fixture-other-org",
    name: "別店舗",
    config_json: JSON.stringify({
      ...configuration,
      products: configuration.products.map((product) => ({
        ...product,
        id: `other-${product.id}`,
      })),
    }),
    updated_at: Date.now(),
  }).run();
  const before = await getEvents(createApiServices(env), device);

  for (const productId of ["missing", "other-tea"])
    await expect(
      showProducts(createApiServices(env), voice, { productIds: ["tea", productId] }),
    ).rejects.toMatchObject({
      code: "PRODUCT_NOT_FOUND",
      status: 422,
    });

  expect(await getEvents(createApiServices(env), device)).toEqual(before);
});

it.each([
  { condition: "空", productIds: [] },
  { condition: "上限超過", productIds: ["tea", "coffee", "tea", "coffee", "tea"] },
])("表示する商品IDが$conditionの場合はイベントを保存しない", async ({ productIds }) => {
  await setupVoice();
  const before = await getEvents(createApiServices(env), device);

  await expect(showProducts(createApiServices(env), voice, { productIds })).rejects.toMatchObject({
    code: "INVALID_INPUT",
    status: 422,
  });

  expect(await getEvents(createApiServices(env), device)).toEqual(before);
});

it("端末から音声商品カードを発行する共有操作は拒否する", async () => {
  await setupVoice();
  const before = await getEvents(createApiServices(env), device);

  await expect(
    showProducts(createApiServices(env), device, { productIds: ["tea"] }),
  ).rejects.toMatchObject({
    status: 403,
  });

  expect(await getEvents(createApiServices(env), device)).toEqual(before);
});

it("画面イベントの保存が失敗したら表示状態の変更もロールバックする", async () => {
  await setupFixture();
  const before = await getTableState(createApiServices(env), device);
  await env.TABLECAST_DB.exec(
    "CREATE TRIGGER tablecast_fail_presentation BEFORE INSERT ON table_events WHEN NEW.kind='table.ui' BEGIN SELECT RAISE(ABORT,'tablecast-test-presentation-failure'); END",
  );

  await expect(setUiSection(createApiServices(env), device, { section: "bill" })).rejects.toThrow(
    "tablecast-test-presentation-failure",
  );

  expect(await getTableState(createApiServices(env), device)).toEqual(before);
});
