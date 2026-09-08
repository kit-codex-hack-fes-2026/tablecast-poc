import { env, exports } from "cloudflare:workers";
import { afterEach, expect, it, vi } from "vitest";
import type { Actor } from "../src/auth";
import {
  closeTable,
  changeLocale,
  getEvents,
  getTableState,
  prepareConfirmation,
  recordVoiceEvent,
  setUiSection,
  setSpeechSpeed,
  setVoiceSession,
  showProducts,
  updateCart,
} from "../src/modules/operations";
import { tableStateSchema } from "../src/schema";
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

it("状態取得中のタブ変更は返却cursorより後のイベントとして回復できる", async () => {
  await setupFixture();
  const readingCatalog = Promise.withResolvers<void>();
  const prepare = env.TABLECAST_DB.prepare.bind(env.TABLECAST_DB);
  vi.spyOn(env.TABLECAST_DB, "prepare").mockImplementation((sql) => {
    if (sql === "SELECT * FROM stores WHERE id=?") readingCatalog.resolve();
    return prepare(sql);
  });
  const reading = getTableState(env, device);
  await readingCatalog.promise;
  await env.TABLECAST_DB.batch([
    prepare("UPDATE table_sessions SET ui_section='orders' WHERE id=?").bind(device.tableSessionId),
    prepare(
      "INSERT INTO table_events(store_id,table_session_id,kind,data_json,created_at) VALUES(?,?,'table.ui',?,?)",
    ).bind(
      device.storeId,
      device.tableSessionId,
      JSON.stringify({ section: "orders" }),
      Date.now(),
    ),
  ]);
  const state = await reading;
  const recovery = await getEvents(env, device, state.cursor);
  expect(state.uiSection).toBe("menu");
  expect(recovery.events).toHaveLength(1);
  expect(recovery.events[0]).toMatchObject({ kind: "table.ui", data: { section: "orders" } });
});

async function setupVoice() {
  const fixture = await setupFixture();
  await setVoiceSession(env, device, voice.voiceSessionId);
  await env.TABLECAST_DB.batch([
    env.TABLECAST_DB.prepare("UPDATE table_sessions SET active_turn_id=? WHERE id=?").bind(
      voice.turnId,
      device.tableSessionId,
    ),
    env.TABLECAST_DB.prepare(
      "INSERT INTO voice_turns(id,voice_session_id,table_session_id,store_id,status,started_at) VALUES(?,?,?,?,'started',?)",
    ).bind(voice.turnId, voice.voiceSessionId, voice.tableSessionId, voice.storeId, Date.now()),
  ]);
  return fixture;
}

it("初期メニューからGUIでカートへ切り替えると同卓の再取得へ反映され、注文確認を維持する", async () => {
  await setupFixture();
  await updateCart(env, device, {
    expectedVersion: 0,
    lines: [{ id: "tea", productId: "tea", quantity: 2, selections: [] }],
  });
  await prepareConfirmation(env, device, { expectedVersion: 1, channel: "gui" });
  const before = await getTableState(env, device);
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
    const before = await getTableState(env, device);

    const response = await patchUi(
      { section: "orders" },
      condition === "店員Cookieのみ" ? cookie : condition === "失効した端末" ? deviceCookie : "",
    );

    expect(response.status).toBe(401);
    expect(await getTableState(env, device)).toEqual(before);
  },
);

it("端末が別卓の来店IDを指定した表示変更は拒否され、どちらの卓にも影響しない", async () => {
  await setupFixture();
  await env.TABLECAST_DB.batch([
    env.TABLECAST_DB.prepare(
      "INSERT INTO restaurant_tables(id,store_id,name) VALUES('tablecast-other-table','tablecast-store','02')",
    ),
    env.TABLECAST_DB.prepare(
      "INSERT INTO table_sessions(id,store_id,table_id,locale,guest_count,opened_at) VALUES('tablecast-other-session','tablecast-store','tablecast-other-table','ja',2,?)",
    ).bind(Date.now()),
  ]);
  const other = { ...device, tableSessionId: "tablecast-other-session" };
  const before = await getTableState(env, device);
  const otherBefore = await getTableState(env, other);

  const response = await patchUi({ section: "bill", tableSessionId: other.tableSessionId });

  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: "INVALID_INPUT" } });
  expect(await getTableState(env, device)).toEqual(before);
  expect(await getTableState(env, other)).toEqual(otherBefore);
});

it("閉卓後の端末による表示変更はHTTPと共有操作の双方で拒否される", async () => {
  const { staff } = await setupFixture();
  await closeTable(env, staff);
  const before = await getTableState(env, staff);

  expect((await patchUi({ section: "orders" })).status).toBe(401);
  await expect(setUiSection(env, device, { section: "orders" })).rejects.toMatchObject({
    code: "SESSION_CLOSED",
    status: 403,
  });

  expect(await getTableState(env, staff)).toEqual(before);
});

it("音声の表示変更は確定カートを維持して自卓へ保存される", async () => {
  await setupVoice();
  await updateCart(env, device, {
    expectedVersion: 0,
    lines: [{ id: "tea", productId: "tea", quantity: 1, selections: [] }],
  });
  const before = await getTableState(env, device);

  const changed = await setUiSection(env, voice, { section: "orders" });

  expect(changed.uiSection).toBe("orders");
  expect(changed.cart).toEqual(before.cart);
  expect((await getTableState(env, device)).uiSection).toBe("orders");
  expect(changed.events.at(-1)).toMatchObject({ kind: "table.ui", data: { section: "orders" } });
});

it("商品詳細と話速を同時更新しても互いの状態やカートを上書きしない", async () => {
  await setupVoice();
  await updateCart(env, device, {
    expectedVersion: 0,
    lines: [{ id: "tea", productId: "tea", quantity: 1, selections: [] }],
  });
  const before = await getTableState(env, device);
  await Promise.all([
    setUiSection(env, voice, { section: "menu", productId: "tea" }),
    setSpeechSpeed(env, device, { speed: 1.3 }),
  ]);
  const state = await getTableState(env, device);
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
  const before = await getTableState(env, device);
  await env.TABLECAST_DB.prepare(
    "INSERT INTO stores(id,organization_id,name,config_json,updated_at) VALUES('tablecast-foreign-store','tablecast-fixture-other-org','別店舗',?,?)",
  )
    .bind(
      JSON.stringify({
        ...configuration,
        products: configuration.products.map((product) => ({
          ...product,
          id: `foreign-${product.id}`,
        })),
      }),
      Date.now(),
    )
    .run();
  const denied = await patchUi({ section: "menu", productId: "foreign-tea" });
  expect(denied.status).toBe(422);
  expect(await denied.json()).toMatchObject({ error: { code: "PRODUCT_NOT_FOUND" } });
  expect(await getTableState(env, device)).toEqual(before);
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
  expect((await getTableState(env, device)).selectedProductId).toBeNull();
});

it("話速の上下限を保存して音声configへ返し、送音とturnと注文確認を維持する", async () => {
  await setupVoice();
  await updateCart(env, device, {
    expectedVersion: 0,
    lines: [{ id: "tea", productId: "tea", quantity: 1, selections: [] }],
  });
  await prepareConfirmation(env, device, { expectedVersion: 1, channel: "gui" });
  await env.TABLECAST_DB.prepare(
    "UPDATE stores SET config_json=json_set(config_json,'$.cast.voice.ja','tablecast-voice-fixture') WHERE id=?",
  )
    .bind(device.storeId)
    .run();
  const before = await getTableState(env, device);
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
    const config = await exports.default.fetch(
      new Request(
        `http://localhost:3000/internal/voice/config?voiceSessionId=${voice.voiceSessionId}`,
        { headers: { Authorization: "Bearer tablecast-test-voice-token" } },
      ),
    );
    expect(config.status).toBe(200);
    expect(await config.json()).toMatchObject({
      speechSpeed: speed,
      voiceSessionId: voice.voiceSessionId,
    });
  }
});

it("話速の範囲外・文字列・非数値・別卓IDと無認可を拒否して状態を維持する", async () => {
  await setupFixture();
  const before = await getTableState(env, device);
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
  expect(await getTableState(env, device)).toEqual(before);
});

it("実行中の音声ツールイベントは保存し、音声停止後の遅延イベントは保存しない", async () => {
  await setupVoice();
  const cursor = (await getEvents(env, device)).cursor;

  expect(
    await recordVoiceEvent(env, voice, {
      kind: "voice.tool",
      data: { toolCallId: "tablecast-tool-call", toolName: "getCatalog", state: "running" },
    }),
  ).toBe(true);
  expect((await getEvents(env, device, cursor)).events).toMatchObject([
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
  await setVoiceSession(env, device, null);
  const stopped = await getEvents(env, device);

  expect(
    await recordVoiceEvent(env, voice, {
      kind: "voice.tool",
      data: { toolCallId: "tablecast-tool-call", toolName: "getCatalog", state: "completed" },
    }),
  ).toBe(false);
  expect(await getEvents(env, device)).toEqual(stopped);
});

it.each(["音声停止", "古いturn", "古い音声セッション", "別卓", "別店舗", "閉卓"])(
  "%sの音声からは表示変更も商品カードも追加されない",
  async (condition) => {
    const { staff } = await setupVoice();
    if (condition === "音声停止") await setVoiceSession(env, device, null);
    if (condition === "閉卓") await closeTable(env, staff);
    if (condition === "別卓")
      await env.TABLECAST_DB.batch([
        env.TABLECAST_DB.prepare(
          "INSERT INTO restaurant_tables(id,store_id,name) VALUES('tablecast-other-table','tablecast-store','02')",
        ),
        env.TABLECAST_DB.prepare(
          "INSERT INTO table_sessions(id,store_id,table_id,locale,guest_count,opened_at,voice_state,voice_session_id,active_turn_id) VALUES('tablecast-other-session','tablecast-store','tablecast-other-table','ja',2,?,'active','tablecast-other-voice','tablecast-other-turn')",
        ).bind(Date.now()),
      ]);
    if (condition === "別店舗")
      await env.TABLECAST_DB.prepare(
        "INSERT INTO stores(id,organization_id,name,config_json,updated_at) VALUES('tablecast-other-store','tablecast-fixture-other-org','別店舗',?,?)",
      )
        .bind(JSON.stringify(configuration), Date.now())
        .run();
    const actor: Actor = {
      ...voice,
      ...(condition === "古いturn" ? { turnId: "tablecast-old-turn" } : {}),
      ...(condition === "古い音声セッション" ? { voiceSessionId: "tablecast-old-voice" } : {}),
      ...(condition === "別卓" ? { tableSessionId: "tablecast-other-session" } : {}),
      ...(condition === "別店舗" ? { storeId: "tablecast-other-store" } : {}),
    };
    const before = await getTableState(env, staff);
    const code = condition === "別店舗" ? "TABLE_NOT_FOUND" : "VOICE_SESSION_STALE";

    await expect(
      setUiSection(env, actor, { section: "menu", productId: "tea" }),
    ).rejects.toMatchObject({ code });
    await expect(setSpeechSpeed(env, actor, { speed: 1.2 })).rejects.toMatchObject({ code });
    await expect(showProducts(env, actor, { productIds: ["tea"] })).rejects.toMatchObject({ code });

    expect(await getTableState(env, staff)).toEqual(before);
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
    const before = await getTableState(env, device);
    const cursor = (await getEvents(env, device)).cursor;

    expect(await showProducts(env, voice, { productIds })).toEqual({ productIds: expected });

    expect((await getEvents(env, device, cursor)).events).toMatchObject([
      {
        storeId: device.storeId,
        tableSessionId: device.tableSessionId,
        kind: "voice.products",
        data: { turnId: voice.turnId, productIds: expected },
      },
    ]);
    const after = await getTableState(env, device);
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

  expect(await showProducts(env, voice, { productIds: ["tea"] })).toEqual({ productIds: ["tea"] });
  expect((await getTableState(env, device)).cart.lines).toEqual([]);
});

it("未知の商品と別店舗だけに存在する商品をカードへ含める要求は全体を拒否する", async () => {
  await setupVoice();
  await env.TABLECAST_DB.prepare(
    "INSERT INTO stores(id,organization_id,name,config_json,updated_at) VALUES('tablecast-other-store','tablecast-fixture-other-org','別店舗',?,?)",
  )
    .bind(
      JSON.stringify({
        ...configuration,
        products: configuration.products.map((product) => ({
          ...product,
          id: `other-${product.id}`,
        })),
      }),
      Date.now(),
    )
    .run();
  const before = await getEvents(env, device);

  for (const productId of ["missing", "other-tea"])
    await expect(
      showProducts(env, voice, { productIds: ["tea", productId] }),
    ).rejects.toMatchObject({
      code: "PRODUCT_NOT_FOUND",
      status: 422,
    });

  expect(await getEvents(env, device)).toEqual(before);
});

it.each([
  { condition: "空", productIds: [] },
  { condition: "上限超過", productIds: ["tea", "coffee", "tea", "coffee", "tea"] },
])("表示する商品IDが$conditionの場合はイベントを保存しない", async ({ productIds }) => {
  await setupVoice();
  const before = await getEvents(env, device);

  await expect(showProducts(env, voice, { productIds })).rejects.toMatchObject({
    code: "INVALID_INPUT",
    status: 422,
  });

  expect(await getEvents(env, device)).toEqual(before);
});

it("端末から音声商品カードを発行する共有操作は拒否する", async () => {
  await setupVoice();
  const before = await getEvents(env, device);

  await expect(showProducts(env, device, { productIds: ["tea"] })).rejects.toMatchObject({
    status: 403,
  });

  expect(await getEvents(env, device)).toEqual(before);
});

it("画面イベントの保存が失敗したら表示状態の変更もロールバックする", async () => {
  await setupFixture();
  const before = await getTableState(env, device);
  await env.TABLECAST_DB.exec(
    "CREATE TRIGGER tablecast_fail_presentation BEFORE INSERT ON table_events WHEN NEW.kind='table.ui' BEGIN SELECT RAISE(ABORT,'tablecast-test-presentation-failure'); END",
  );

  await expect(setUiSection(env, device, { section: "bill" })).rejects.toThrow(
    "tablecast-test-presentation-failure",
  );

  expect(await getTableState(env, device)).toEqual(before);
});

it("停止後の古い音声turnは言語を書き換えずGUIの状態を保つ", async () => {
  await setupVoice();
  await setVoiceSession(env, device, null);
  const before = await getTableState(env, device);
  await expect(changeLocale(env, voice, "en")).rejects.toMatchObject({
    code: "VOICE_SESSION_STALE",
  });
  expect(await getTableState(env, device)).toEqual(before);
});
