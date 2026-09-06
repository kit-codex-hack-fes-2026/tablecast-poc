import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  callStaff,
  changeLocale,
  closeTable,
  getEvents,
  getTableState,
  markConfirmationRead,
  prepareConfirmation,
  recordPayment,
  setVoiceSession,
  submitOrder,
  updateCart,
} from "../src/modules/operations";
import {
  createDraft,
  publishDraft,
  updateDraft,
  validateDraft,
} from "../src/modules/configuration";
import { device, deviceToken, setupFixture, text } from "./fixture";
import { finishVoiceTurn } from "../src/voice";
import { planSchema, tableStateSchema } from "../src/schema";
import app from "../src/app";

const teaLine = { id: "line-1", productId: "tea", quantity: 2, selections: [] };
const tea = [teaLine];
it("プランのラストオーダー後も対象外商品は通常価格で確認・注文できる", async () => {
  await setupFixture();
  const rules = planSchema.parse({
    id: "tablecast-coffee-plan",
    text: text("ラテのプラン", "Latte plan"),
    pricePerPerson: 1800,
    durationMinutes: 90,
    lastOrderMinutesBeforeEnd: 10,
    productIds: ["coffee"],
    categoryIds: [],
    tags: [],
    maxPerOrder: 4,
    maxTotalPerPerson: 10,
    intervalSeconds: 30,
    excludedOptionIds: [],
    includedOptionSurcharge: true,
  });
  await env.TABLECAST_DB.prepare("UPDATE table_sessions SET plan_json=? WHERE id=?")
    .bind(
      JSON.stringify({ id: rules.id, startedAt: Date.now() - 81 * 60_000, rules }),
      device.tableSessionId,
    )
    .run();

  const snapshot = await confirmed();
  expect(snapshot.expiresAt).toBeGreaterThan(Date.now());
  const order = await submitOrder(env, device, {
    snapshotId: snapshot.id,
    idempotencyKey: "tablecast-after-plan-last-order",
    approved: true,
  });
  expect(order.total).toBe(800);
  expect(order.snapshot.lines.every((line) => !line.planCovered)).toBe(true);
  await expect(
    updateCart(env, device, {
      expectedVersion: 2,
      lines: [
        {
          id: "latte",
          productId: "coffee",
          quantity: 1,
          selections: [{ optionId: "dairy", quantity: 1 }],
        },
      ],
    }),
  ).rejects.toMatchObject({ code: "PLAN_LAST_ORDER" });
});
async function confirmed() {
  await updateCart(env, device, { expectedVersion: 0, lines: tea });
  return prepareConfirmation(env, device, { expectedVersion: 1, channel: "gui" });
}
describe("実D1の注文契約", () => {
  it("必須選択を下書きとして保持し、同じ行を完成して税込価格を計算する", async () => {
    await setupFixture();
    const draft = await updateCart(env, device, {
      expectedVersion: 0,
      lines: [{ id: "coffee-line", productId: "coffee", quantity: 1, selections: [] }],
    });
    expect(draft.cart.complete).toBe(false);
    expect(draft.cart.lines[0]?.missing).toContain("milk");
    await expect(
      prepareConfirmation(env, device, { expectedVersion: 1, channel: "gui" }),
    ).rejects.toMatchObject({ code: "CART_INCOMPLETE" });
    const state = await updateCart(env, device, {
      expectedVersion: 1,
      lines: [
        {
          id: "coffee-line",
          productId: "coffee",
          quantity: 1,
          selections: [{ optionId: "oat", quantity: 1 }],
        },
      ],
    });
    expect(state.cart.lines).toHaveLength(1);
    expect(state.cart.total).toBe(600);
  });
  it("同時カート変更の片方だけ成立し、不成立バッチからイベントを作らない", async () => {
    await setupFixture();
    const results = await Promise.allSettled([
      updateCart(env, device, { expectedVersion: 0, lines: tea }),
      updateCart(env, device, {
        expectedVersion: 0,
        lines: [{ ...teaLine, id: "other", quantity: 1 }],
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await getTableState(env, device)).cart.version).toBe(1);
    expect(
      (await getEvents(env, device)).events.filter((event) => event.kind === "cart.updated"),
    ).toHaveLength(1);
  });
  it("古い確認と未承認を拒否し、同じ冪等キーの二重送信や応答喪失から一件に復元する", async () => {
    await setupFixture();
    const old = await confirmed();
    await updateCart(env, device, { expectedVersion: 1, lines: tea });
    await expect(
      submitOrder(env, device, {
        snapshotId: old.id,
        idempotencyKey: "tablecast-order-old",
        approved: true,
      }),
    ).rejects.toMatchObject({ code: "CONFIRMATION_STALE" });
    const snapshot = await prepareConfirmation(env, device, { expectedVersion: 2, channel: "gui" });
    const payload = {
      snapshotId: snapshot.id,
      idempotencyKey: "tablecast-order-once",
      approved: true as const,
    };
    const orders = await Promise.all([
      submitOrder(env, device, payload),
      submitOrder(env, device, payload),
    ]);
    expect(orders[0]?.id).toBe(orders[1]?.id);
    expect((await submitOrder(env, device, payload)).id).toBe(orders[0]?.id);
    const state = await getTableState(env, device);
    expect(state.orders).toHaveLength(1);
    expect(state.bill.orderedTotal).toBe(800);
    expect(state.cart.lines).toHaveLength(0);
  });
  it("途中の制約違反でカート・注文・イベントがすべてロールバックする", async () => {
    await setupFixture();
    const snapshot = await confirmed();
    await env.TABLECAST_DB.exec(
      "CREATE TRIGGER tablecast_fail_order BEFORE INSERT ON orders BEGIN SELECT RAISE(ABORT,'tablecast-test-failure'); END",
    );
    await expect(
      submitOrder(env, device, {
        snapshotId: snapshot.id,
        idempotencyKey: "tablecast-failed-order",
        approved: true,
      }),
    ).rejects.toThrow("tablecast-test-failure");
    const state = await getTableState(env, device);
    expect(state.cart.version).toBe(1);
    expect(state.cart.total).toBe(800);
    expect(state.orders).toHaveLength(0);
    expect(state.events.some((e) => e.kind === "order.submitted")).toBe(false);
  });
  it("価格改ざんと別店舗・別卓への読み書きをHTTP入口で拒否する", async () => {
    await setupFixture();
    const request = new Request("http://localhost:3000/api/table/cart", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: `tablecast.device=${deviceToken}` },
      body: JSON.stringify({ expectedVersion: 0, lines: [{ ...teaLine, price: 1 }] }),
    });
    expect((await exports.default.fetch(request)).status).toBe(422);
    await expect(getTableState(env, { ...device, storeId: "another-store" })).rejects.toMatchObject(
      { code: "TABLE_NOT_FOUND" },
    );
    expect(
      (
        await exports.default.fetch(
          new Request("http://localhost:3000/api/admin/stores/tablecast-store", {
            headers: { Cookie: `tablecast.device=${deviceToken}` },
          }),
        )
      ).status,
    ).toBe(401);
  });
  it("注文済みだけを請求し、未送信カートと冪等支払を分離する", async () => {
    const { staff } = await setupFixture();
    const snapshot = await confirmed();
    await submitOrder(env, device, {
      snapshotId: snapshot.id,
      idempotencyKey: "tablecast-paid-order",
      approved: true,
    });
    await updateCart(env, device, { expectedVersion: 2, lines: tea });
    const input = {
      amount: 800,
      kind: "payment" as const,
      reason: "モック支払",
      idempotencyKey: "tablecast-pay-once",
    };
    await recordPayment(env, staff, input);
    const state = await recordPayment(env, staff, input);
    expect(state.bill.due).toBe(0);
    expect(state.bill.paidTotal).toBe(800);
    expect(state.bill.cartTotal).toBe(800);
  });
  it("設定公開は人の権限と検証版が必要で、価格変更後の確認を失効させる", async () => {
    const { staff } = await setupFixture();
    const snapshot = await confirmed();
    let draft = await createDraft(env, staff);
    draft.configuration.products = draft.configuration.products.map((product) =>
      product.id === "tea" ? { ...product, price: 450 } : product,
    );
    draft = await updateDraft(env, staff, draft.id, {
      expectedVersion: 1,
      configuration: draft.configuration,
    });
    await validateDraft(env, staff, draft.id, 2);
    const input = {
      expectedVersion: 2,
      baseVersion: 1,
      idempotencyKey: "tablecast-publish-once",
      approved: true as const,
    };
    await expect(
      publishDraft(env, { ...staff, kind: "mcp", canWrite: true }, draft.id, input),
    ).rejects.toMatchObject({ code: "HUMAN_APPROVAL_REQUIRED" });
    await publishDraft(env, staff, draft.id, input);
    await publishDraft(env, staff, draft.id, input);
    await expect(
      submitOrder(env, device, {
        snapshotId: snapshot.id,
        idempotencyKey: "tablecast-stale-price",
        approved: true,
      }),
    ).rejects.toMatchObject({ code: "CONFIRMATION_STALE" });
  });
  it("音声停止と古いturn中断で確定カートを保持し、遅延した追加操作を拒否する", async () => {
    await setupFixture();
    await setVoiceSession(env, device, "tablecast-voice-session");
    await env.TABLECAST_DB.prepare(
      "UPDATE table_sessions SET active_turn_id='tablecast-turn' WHERE id=?",
    )
      .bind(device.tableSessionId)
      .run();
    await env.TABLECAST_DB.prepare(
      "INSERT INTO voice_turns(id,voice_session_id,table_session_id,store_id,status,started_at,ended_at) VALUES('tablecast-turn','tablecast-voice-session','tablecast-session','tablecast-store','started',?,NULL)",
    )
      .bind(Date.now())
      .run();
    const voice = {
      ...device,
      kind: "voice" as const,
      voiceSessionId: "tablecast-voice-session",
      turnId: "tablecast-turn",
    };
    await updateCart(env, voice, { expectedVersion: 0, lines: tea });
    await setVoiceSession(env, device, null);
    await finishVoiceTurn(env, "tablecast-voice-session", "tablecast-turn", "interrupted");
    await expect(updateCart(env, voice, { expectedVersion: 1, lines: [] })).rejects.toMatchObject({
      code: "VOICE_SESSION_STALE",
    });
    const state = await getTableState(env, device);
    expect(state.cart.total).toBe(800);
    expect(state.voiceState).toBe("stopped");
  });
  it("DO通知の接続がなくても永続カーソルから欠落と重複を復旧する", async () => {
    await setupFixture();
    const before = await getEvents(env, device);
    await callStaff(env, device);
    await updateCart(env, device, { expectedVersion: 0, lines: tea });
    const after = await getEvents(env, device, before.cursor);
    expect(after.events.map((e) => e.kind)).toEqual(["staff.called", "cart.updated"]);
    expect((await getEvents(env, device, after.cursor)).events).toHaveLength(0);
  });
});

it("停止操作が先行した場合は遅れて完了した音声開始をDBでも拒否する", async () => {
  await setupFixture();
  await setVoiceSession(env, device, null);
  await expect(
    setVoiceSession(env, device, "tablecast-late-start", undefined, 0),
  ).rejects.toMatchObject({ code: "SESSION_STALE" });
  expect((await getTableState(env, device)).voiceState).toBe("stopped");
});
it("別タブからの二重音声開始を拒否して元のRoomを維持する", async () => {
  await setupFixture();
  await setVoiceSession(env, device, "tablecast-original-voice");
  const response = await exports.default.fetch(
    new Request("http://localhost:3000/api/table/voice/start", {
      method: "POST",
      headers: { Cookie: `tablecast.device=${deviceToken}` },
    }),
  );
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: { code: "VOICE_ALREADY_ACTIVE" } });
  expect(
    await env.TABLECAST_DB.prepare(
      "SELECT voice_session_id,voice_version FROM table_sessions WHERE id=?",
    )
      .bind(device.tableSessionId)
      .first(),
  ).toEqual({ voice_session_id: "tablecast-original-voice", voice_version: 1 });
});
it.each(["false", "true"])(
  "音声有効設定%sに従い、準備未完了ではRoom tokenを発行しない",
  async (enabled) => {
    await setupFixture();
    await env.TABLECAST_DB.prepare(
      "UPDATE stores SET config_json=json_set(config_json,'$.cast.voice.ja','tablecast-voice-fixture-ja','$.cast.voice.en','tablecast-voice-fixture-en') WHERE id='tablecast-store'",
    ).run();
    const response = await app.request(
      new Request("http://localhost:3000/api/table/voice/start", {
        method: "POST",
        headers: { Cookie: `tablecast.device=${deviceToken}` },
      }),
      undefined,
      {
        ...env,
        TABLECAST_VOICE_ENABLED: enabled,
        TABLECAST_LIVEKIT_URL: "ws://tablecast-livekit.local",
        TABLECAST_LIVEKIT_API_KEY: "tablecast-test-key",
        TABLECAST_LIVEKIT_API_SECRET: "tablecast-test-secret",
        TABLECAST_MODEL_API_KEY: "tablecast-test-model-key",
        TABLECAST_MODEL: "gpt-4.1-mini",
      },
    );
    expect(response.status).toBe(enabled === "true" ? 200 : 503);
    expect((await getTableState(env, device)).voiceState).toBe(
      enabled === "true" ? "active" : "stopped",
    );
  },
);
it.each(["音声停止", "言語変更", "閉卓"])(
  "%sの同じDB更新で進行中turnを中断し、完了済みturnと遅延通知を区別する",
  async (operation) => {
    const { staff } = await setupFixture();
    await setVoiceSession(env, device, "tablecast-lifecycle-voice");
    await env.TABLECAST_DB.prepare(
      "INSERT INTO voice_turns(id,voice_session_id,table_session_id,store_id,status,started_at,ended_at) VALUES('tablecast-inflight','tablecast-lifecycle-voice','tablecast-session','tablecast-store','started',1,NULL),('tablecast-complete','tablecast-lifecycle-voice','tablecast-session','tablecast-store','completed',1,2)",
    ).run();
    if (operation === "音声停止") await setVoiceSession(env, device, null);
    else if (operation === "言語変更") await changeLocale(env, device, "en");
    else await closeTable(env, staff);
    await finishVoiceTurn(env, "tablecast-lifecycle-voice", "tablecast-inflight", "completed");
    const interrupted = await env.TABLECAST_DB.prepare(
      "SELECT status,ended_at FROM voice_turns WHERE id='tablecast-inflight'",
    ).first<{ status: string; ended_at: number | null }>();
    expect(interrupted?.status).toBe("interrupted");
    expect(interrupted?.ended_at).toBeGreaterThan(1);
    expect(
      await env.TABLECAST_DB.prepare(
        "SELECT status,ended_at FROM voice_turns WHERE id='tablecast-complete'",
      ).first(),
    ).toEqual({ status: "completed", ended_at: 2 });
  },
);
it("遅延した旧音声停止は新しい会話を維持し、別卓のRoomを指定した停止を拒否する", async () => {
  await setupFixture();
  await setVoiceSession(env, device, "tablecast-old-voice");
  await setVoiceSession(env, device, null);
  await setVoiceSession(env, device, "tablecast-new-voice");
  const stop = (voiceSessionId: string) =>
    exports.default.fetch(
      new Request("http://localhost:3000/api/table/voice/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: `tablecast.device=${deviceToken}` },
        body: JSON.stringify({ voiceSessionId }),
      }),
    );
  const response = await stop("tablecast-old-voice");
  expect(response.status).toBe(200);
  expect(tableStateSchema.parse(await response.json()).voiceState).toBe("active");
  expect((await stop("tablecast-other-table-voice")).status).toBe(404);
  expect((await stop("tablecast-new-voice")).status).toBe(200);
  expect((await getTableState(env, device)).voiceState).toBe("stopped");
});
it.each([
  ["商品削除", "PRODUCT_NOT_FOUND"],
  ["売切", "SOLD_OUT"],
  ["選択肢削除", "OPTION_NOT_FOUND"],
])("公開した%sでカートが無効になっても画面取得と修正ができる", async (change, code) => {
  const { staff } = await setupFixture();
  await updateCart(env, device, {
    expectedVersion: 0,
    lines: [
      {
        id: "coffee-line",
        productId: "coffee",
        quantity: 1,
        selections: [{ optionId: "oat", quantity: 1 }],
      },
    ],
  });
  const old = await prepareConfirmation(env, device, { expectedVersion: 1, channel: "gui" });
  let draft = await createDraft(env, staff);
  if (change === "商品削除")
    draft.configuration.products = draft.configuration.products.filter(
      (product) => product.id !== "coffee",
    );
  else {
    const coffee = draft.configuration.products.find((product) => product.id === "coffee");
    if (!coffee) throw new Error("確認対象の商品がありません");
    if (change === "売切") coffee.available = false;
    else
      for (const modifier of coffee.modifiers)
        modifier.options = modifier.options.filter((option) => option.id !== "oat");
  }
  draft = await updateDraft(env, staff, draft.id, {
    expectedVersion: 1,
    configuration: draft.configuration,
  });
  await validateDraft(env, staff, draft.id, 2);
  await publishDraft(env, staff, draft.id, {
    expectedVersion: 2,
    baseVersion: 1,
    idempotencyKey: "tablecast-catalog-invalidation",
    approved: true,
  });
  const response = await exports.default.fetch(
    new Request("http://localhost:3000/api/table", {
      headers: { Cookie: `tablecast.device=${deviceToken}` },
    }),
  );
  expect(response.status).toBe(200);
  const displayed = tableStateSchema.parse(await response.json());
  expect(displayed.cart.complete).toBe(false);
  expect(displayed.cart.lines[0]?.id).toBe("coffee-line");
  await expect(
    submitOrder(env, device, {
      snapshotId: old.id,
      idempotencyKey: "tablecast-invalid-catalog-order",
      approved: true,
    }),
  ).rejects.toMatchObject({ code });
  await updateCart(env, device, { expectedVersion: displayed.cart.version, lines: tea });
  const repaired = await getTableState(env, device);
  expect(repaired.cart.complete).toBe(true);
  expect(
    (
      await prepareConfirmation(env, device, {
        expectedVersion: repaired.cart.version,
        channel: "gui",
      })
    ).total,
  ).toBe(800);
});
it("音声確認の読了後に開始した新しいturnだけが承認できる", async () => {
  await setupFixture();
  await setVoiceSession(env, device, "tablecast-voice-session");
  await env.TABLECAST_DB.prepare(
    "INSERT INTO voice_turns(id,voice_session_id,table_session_id,store_id,status,started_at) VALUES('tablecast-first','tablecast-voice-session','tablecast-session','tablecast-store','started',?)",
  )
    .bind(Date.now())
    .run();
  await env.TABLECAST_DB.prepare(
    "UPDATE table_sessions SET active_turn_id='tablecast-first' WHERE id='tablecast-session'",
  ).run();
  const first = {
    ...device,
    kind: "voice" as const,
    voiceSessionId: "tablecast-voice-session",
    turnId: "tablecast-first",
  };
  await updateCart(env, first, { expectedVersion: 0, lines: tea });
  const snapshot = await prepareConfirmation(env, first, { expectedVersion: 1, channel: "voice" });
  const input = {
    snapshotId: snapshot.id,
    idempotencyKey: "tablecast-spoken-order",
    approved: true as const,
  };
  await expect(submitOrder(env, first, input)).rejects.toMatchObject({
    code: "NEW_APPROVAL_TURN_REQUIRED",
  });
  await markConfirmationRead(env, first, snapshot.id);
  await env.TABLECAST_DB.prepare(
    "INSERT INTO voice_turns(id,voice_session_id,table_session_id,store_id,status,started_at) SELECT 'tablecast-approval','tablecast-voice-session','tablecast-session','tablecast-store','started',read_at+1 FROM confirmations WHERE id=?",
  )
    .bind(snapshot.id)
    .run();
  await env.TABLECAST_DB.prepare(
    "UPDATE table_sessions SET active_turn_id='tablecast-approval' WHERE id='tablecast-session'",
  ).run();
  const order = await submitOrder(env, { ...first, turnId: "tablecast-approval" }, input);
  expect(order.total).toBe(800);
});
it("DOのWebSocket通知後に切断しても、再接続時に永続イベントを回収する", async () => {
  await setupFixture();
  const stub = env.TABLECAST_EVENTS.get(env.TABLECAST_EVENTS.idFromName(device.storeId));
  const connected = await stub.fetch(
    new Request("http://tablecast-events/live", { headers: { Upgrade: "websocket" } }),
  );
  const socket = connected.webSocket;
  if (!socket) throw new Error("WebSocketへ接続できません");
  socket.accept();
  const notification = new Promise<string>((resolve) => {
    socket.addEventListener("message", (event) => resolve(String(event.data)), { once: true });
  });
  await callStaff(env, device);
  expect(await notification).toContain("cursor");
  const cursor = (await getEvents(env, device)).cursor;
  socket.close(1000);
  await updateCart(env, device, { expectedVersion: 0, lines: tea });
  const recovered = await getEvents(env, device, cursor);
  expect(recovered.events.map((event) => event.kind)).toEqual(["cart.updated"]);
});
