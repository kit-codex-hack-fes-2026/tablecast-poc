import { env, exports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import type { Actor } from "../src/modules/auth/model";
import * as businessTables from "../src/db/business-schema";
import { updateCart } from "../src/modules/orders/use-cases/cart";
import { prepareConfirmation } from "../src/modules/orders/use-cases/confirmation";
import { getEvents } from "../src/modules/stores/queries";
import { getTableState } from "../src/modules/tables/queries";
import { closeTable } from "../src/modules/tables/use-cases/lifecycle";
import { changeLocale, setUiSection } from "../src/modules/tables/use-cases/presentation";
import { setSpeechSpeed, setVoiceSession } from "../src/modules/voice/service";
import { createApiServices } from "../src/platform/context";
import { tableStateSchema } from "../src/schema";
import { fixtureDb, insertFixture } from "./database-fixture";
import { configuration, device, deviceToken, setupFixture } from "./fixture";

const deviceCookie = `tablecast.device=${deviceToken}`;

afterEach(() => vi.restoreAllMocks());

const voice = {
  ...device,
  kind: "voice",
  voiceSessionId: "tablecast-presentation-voice",
  turnId: "tablecast-presentation-turn",
} satisfies Actor;

function patchUi(body: unknown, cookie = deviceCookie) {
  return exports.default.fetch(
    new Request("http://localhost:3000/api/table/ui", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
    }),
  );
}

function patchSpeed(body: unknown, cookie = deviceCookie) {
  return exports.default.fetch(
    new Request("http://localhost:3000/api/table/voice/speed", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
    }),
  );
}

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

it("状態取得中のタブ変更は返却cursorより後のイベントとして回復できる", async () => {
  // Given: 読取batchが完了した後、HTTPへ返す前で待つ。
  await setupFixture();
  const readCompleted = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const batch = env.TABLECAST_DB.batch.bind(env.TABLECAST_DB);
  vi.spyOn(env.TABLECAST_DB, "batch").mockImplementationOnce(
    async <T>(statements: D1PreparedStatement[]) => {
      const result = await batch<T>(statements);
      readCompleted.resolve();
      await release.promise;
      return result;
    },
  );
  const reading = getTableState(createApiServices(env), device);
  try {
    await readCompleted.promise;
    // When: 保存済み状態の取得後にタブ変更と通知を同じtransactionへ書く。
    await fixtureDb.batch([
      fixtureDb
        .update(businessTables.tableSessions)
        .set({ ui_section: "orders" })
        .where(eq(businessTables.tableSessions.id, device.tableSessionId)),
      fixtureDb.insert(businessTables.tableEvents).values({
        store_id: device.storeId,
        table_session_id: device.tableSessionId,
        kind: "table.ui",
        data_json: JSON.stringify({ section: "orders" }),
        created_at: Date.now(),
      }),
    ]);
  } finally {
    release.resolve();
  }
  // Then: 返した旧状態より後の変更をcursorで回収できる。
  const state = await reading;
  const recovery = await getEvents(createApiServices(env), device, state.cursor);
  expect(state.uiSection).toBe("menu");
  expect(recovery.events).toHaveLength(1);
  expect(recovery.events[0]).toMatchObject({ kind: "table.ui", data: { section: "orders" } });
});

it("初期メニューからGUIでカートへ切り替えると同卓の再取得へ反映され、注文確認を維持する", async () => {
  await setupFixture();
  await updateCart(createApiServices(env), device, {
    expectedVersion: 0,
    lines: [{ id: "tea", productId: "tea", quantity: 2, selections: [] }],
  });
  await prepareConfirmation(createApiServices(env), device, { expectedVersion: 1, channel: "gui" });
  const before = await getTableState(createApiServices(env), device);
  expect(before.uiSection).toBe("menu");
  expect(before.selectedProductId).toBeNull();
  expect(before.speechSpeed).toBe(1.0);

  const response = await patchUi({ section: "cart" });
  const reloaded = await exports.default.fetch(
    new Request("http://localhost:3000/api/table", { headers: { Cookie: deviceCookie } }),
  );

  expect(response.status).toBe(200);
  const changed = tableStateSchema.parse(await response.json());
  expect(tableStateSchema.parse(await reloaded.json())).toEqual(changed);
  expect(changed.uiSection).toBe("cart");
  expect(changed.cart).toEqual(before.cart);
  expect(before.snapshot).not.toBeNull();
  expect(changed.snapshot).toEqual(before.snapshot);
  expect(changed.bill).toEqual(before.bill);
  expect(changed.events.at(-1)).toMatchObject({
    storeId: device.storeId,
    tableSessionId: device.tableSessionId,
    kind: "table.ui",
    data: { section: "cart" },
  });
});

it.each(["端末Cookieなし", "店員Cookieのみ", "失効した端末"])(
  "%sの表示変更は認可されず状態もイベントも変わらない",
  async (condition) => {
    const { cookie } = await setupFixture();
    if (condition === "失効した端末")
      await env.TABLECAST_DB.prepare("UPDATE devices SET revoked_at=? WHERE id='tablecast-device'")
        .bind(Date.now())
        .run();
    const before = await getTableState(createApiServices(env), device);

    const response = await patchUi(
      { section: "orders" },
      condition === "店員Cookieのみ" ? cookie : condition === "失効した端末" ? deviceCookie : "",
    );

    expect(response.status).toBe(401);
    expect(await getTableState(createApiServices(env), device)).toEqual(before);
  },
);

it("端末が別卓の来店IDを指定した表示変更は拒否され、どちらの卓にも影響しない", async () => {
  await setupFixture();
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
    }),
  ]);
  const other = { ...device, tableSessionId: "tablecast-other-session" };
  const before = await getTableState(createApiServices(env), device);
  const otherBefore = await getTableState(createApiServices(env), other);

  const response = await patchUi({ section: "bill", tableSessionId: other.tableSessionId });

  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: "INVALID_INPUT" } });
  expect(await getTableState(createApiServices(env), device)).toEqual(before);
  expect(await getTableState(createApiServices(env), other)).toEqual(otherBefore);
});

it("閉卓後の端末による表示変更はHTTPと共有操作の双方で拒否される", async () => {
  const { staff } = await setupFixture();
  await closeTable(createApiServices(env), staff);
  const before = await getTableState(createApiServices(env), staff);

  expect((await patchUi({ section: "orders" })).status).toBe(401);
  await expect(
    setUiSection(createApiServices(env), device, { section: "orders" }),
  ).rejects.toMatchObject({
    code: "SESSION_CLOSED",
    status: 403,
  });

  expect(await getTableState(createApiServices(env), staff)).toEqual(before);
});

it("音声の表示変更は確定カートを維持して自卓へ保存される", async () => {
  await setupVoice();
  await updateCart(createApiServices(env), device, {
    expectedVersion: 0,
    lines: [{ id: "tea", productId: "tea", quantity: 1, selections: [] }],
  });
  const before = await getTableState(createApiServices(env), device);

  const changed = await setUiSection(createApiServices(env), voice, { section: "orders" });

  expect(changed.uiSection).toBe("orders");
  expect(changed.cart).toEqual(before.cart);
  expect((await getTableState(createApiServices(env), device)).uiSection).toBe("orders");
  expect(changed.events.at(-1)).toMatchObject({ kind: "table.ui", data: { section: "orders" } });
});

it("商品詳細と話速を同時更新しても互いの状態やカートを上書きしない", async () => {
  await setupVoice();
  await updateCart(createApiServices(env), device, {
    expectedVersion: 0,
    lines: [{ id: "tea", productId: "tea", quantity: 1, selections: [] }],
  });
  const before = await getTableState(createApiServices(env), device);
  await Promise.all([
    setUiSection(createApiServices(env), voice, { section: "menu", productId: "tea" }),
    setSpeechSpeed(createApiServices(env), device, { speed: 1.3 }),
  ]);
  const state = await getTableState(createApiServices(env), device);
  expect(state).toMatchObject({
    uiSection: "menu",
    selectedProductId: "tea",
    speechSpeed: 1.3,
    voiceState: "active",
    voiceSessionId: voice.voiceSessionId,
  });
  expect(state.cart).toEqual(before.cart);
  expect(state.events.filter((event) => event.kind === "table.ui").at(-1)?.data).toEqual({
    section: "menu",
    productId: "tea",
  });
  expect(state.events.filter((event) => event.kind === "voice.speed").at(-1)?.data).toEqual({
    speed: 1.3,
  });
});

it("GUIで商品詳細を選び、商品省略・明示解除・他タブへの移動で詳細を閉じる", async () => {
  await setupFixture();
  for (const target of [
    { section: "menu" },
    { section: "menu", productId: null },
    { section: "orders", productId: "tea" },
  ]) {
    const opened = await patchUi({ section: "menu", productId: "tea" });
    expect(opened.status).toBe(200);
    expect(tableStateSchema.parse(await opened.json()).selectedProductId).toBe("tea");
    const closed = await patchUi(target);
    expect(closed.status).toBe(200);
    expect(tableStateSchema.parse(await closed.json()).selectedProductId).toBeNull();
  }
});

it("商品詳細は同店舗の公開商品だけを許可し、売切は閲覧でき、削除後は選択を表示しない", async () => {
  await setupFixture();
  const before = await getTableState(createApiServices(env), device);
  await insertFixture(businessTables.stores, {
    id: "tablecast-foreign-store",
    organization_id: "tablecast-fixture-other-org",
    name: "別店舗",
    config_json: JSON.stringify({
      ...configuration,
      products: configuration.products.map((product) => ({
        ...product,
        id: `foreign-${product.id}`,
      })),
    }),
    updated_at: Date.now(),
  }).run();
  const denied = await patchUi({ section: "menu", productId: "foreign-tea" });
  expect(denied.status).toBe(422);
  expect(await denied.json()).toMatchObject({ error: { code: "PRODUCT_NOT_FOUND" } });
  expect(await getTableState(createApiServices(env), device)).toEqual(before);
  await env.TABLECAST_DB.prepare(
    "UPDATE stores SET config_json=json_set(config_json,'$.products[0].available',json('false')) WHERE id=?",
  )
    .bind(device.storeId)
    .run();
  const opened = await patchUi({ section: "menu", productId: "tea" });
  expect(opened.status).toBe(200);
  expect(tableStateSchema.parse(await opened.json()).selectedProductId).toBe("tea");
  await env.TABLECAST_DB.prepare(
    "UPDATE stores SET config_json=json_remove(config_json,'$.products[0]') WHERE id=?",
  )
    .bind(device.storeId)
    .run();
  expect((await getTableState(createApiServices(env), device)).selectedProductId).toBeNull();
});

it("話速の上下限を卓へ返し、送音とturnと注文確認を維持する", async () => {
  await setupVoice();
  await updateCart(createApiServices(env), device, {
    expectedVersion: 0,
    lines: [{ id: "tea", productId: "tea", quantity: 1, selections: [] }],
  });
  await prepareConfirmation(createApiServices(env), device, { expectedVersion: 1, channel: "gui" });
  await env.TABLECAST_DB.prepare(
    "UPDATE stores SET config_json=json_set(config_json,'$.cast.voice.ja','tablecast-voice-fixture') WHERE id=?",
  )
    .bind(device.storeId)
    .run();
  const before = await getTableState(createApiServices(env), device);
  for (const speed of [0.5, 1, 1.5]) {
    const changed = await patchSpeed({ speed });
    expect(changed.status).toBe(200);
    const state = tableStateSchema.parse(await changed.json());
    expect(state).toMatchObject({
      speechSpeed: speed,
      voiceState: "active",
      voiceSessionId: voice.voiceSessionId,
    });
    expect(state.cart).toEqual(before.cart);
    expect(state.snapshot).toEqual(before.snapshot);
    expect(
      await env.TABLECAST_DB.prepare("SELECT active_turn_id FROM table_sessions WHERE id=?")
        .bind(device.tableSessionId)
        .first("active_turn_id"),
    ).toBe(voice.turnId);
  }
});

it("話速の範囲外・文字列・非数値・別卓IDと無認可を拒否して状態を維持する", async () => {
  await setupFixture();
  const before = await getTableState(createApiServices(env), device);
  for (const body of [
    { speed: 0.49 },
    { speed: 1.6 },
    { speed: 1.15 },
    { speed: "1.2" },
    { speed: null },
    { speed: 1.2, tableSessionId: "other" },
  ]) {
    expect((await patchSpeed(body)).status).toBe(422);
  }
  expect((await patchSpeed({ speed: 1.2 }, "")).status).toBe(401);
  expect(await getTableState(createApiServices(env), device)).toEqual(before);
});

it("停止後の古い音声turnは言語を書き換えずGUIの状態を保つ", async () => {
  await setupVoice();
  await setVoiceSession(createApiServices(env), device, null);
  const before = await getTableState(createApiServices(env), device);
  await expect(changeLocale(createApiServices(env), voice, "en")).rejects.toMatchObject({
    code: "VOICE_SESSION_STALE",
  });
  expect(await getTableState(createApiServices(env), device)).toEqual(before);
});
