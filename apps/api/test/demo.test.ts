import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import app from "../src/app";
import * as auth from "../src/db/auth-schema";
import * as business from "../src/db/business-schema";
import { createDemo, updateDemo, resetDemo } from "../src/modules/demo/service";
import { getDemo } from "../src/modules/demo/queries";
import { getCatalog } from "../src/modules/catalog/queries";
import { createDraft, updateDraft } from "../src/modules/configuration/service";
import { updateCart, prepareConfirmation, submitOrder } from "../src/modules/orders/service";
import { getAdminState, getEvents } from "../src/modules/stores/queries";
import { getTableState } from "../src/modules/tables/queries";
import { callStaff, requestBill } from "../src/modules/tables/service";
import { voiceActor } from "../src/modules/voice/queries";
import { createCastTools } from "../src/modules/voice/agent";
import { getVoiceConfiguration } from "../src/modules/voice/realtime";
import { setVoiceSession } from "../src/modules/voice/service";
import { createApiServices } from "../src/platform/context";
import { demoSchema, tableStateSchema } from "../src/schema";
import { fixtureDb } from "./database-fixture";
import { device, setupFixture, text } from "./fixture";
const services = () => createApiServices(env);
const lines = [{ id: "tablecast-demo-line", productId: "tea", quantity: 2, selections: [] }];
async function setup() {
  const fixture = await setupFixture();
  const demo = await createDemo(services(), fixture.staff);
  const actor = { ...fixture.staff, tableSessionId: demo.id, demoId: demo.id };
  return { ...fixture, demo, actor };
}

describe("卓を使わない会話注文デモ", () => {
  it("管理者がデモを作ると卓・端末を増やさず、HTTPと保存状態で卓なしを確認できる", async () => {
    const { cookie } = await setupFixture();
    const response = await app.request(
      "http://localhost:3000/api/admin/stores/tablecast-store/demo",
      { method: "POST", headers: { Cookie: cookie } },
      env,
    );
    expect(response.status).toBe(200);
    const demo = demoSchema.parse(await response.json());
    const stateResponse = await app.request(
      `http://localhost:3000/api/admin/stores/tablecast-store/demo/${demo.id}/table`,
      { headers: { Cookie: cookie } },
      env,
    );
    const state = tableStateSchema.parse(await stateResponse.json());
    expect(state).toMatchObject({
      kind: "demo",
      tableId: null,
      guestCount: 1,
      voiceState: "stopped",
    });
    expect(await fixtureDb.select().from(business.restaurantTables)).toHaveLength(1);
    expect(await fixtureDb.select().from(business.devices)).toHaveLength(1);
  });

  it("デモで注文・呼出し・会計要求をしても実営業の一覧とイベントに混入しない", async () => {
    const { actor, staff } = await setup();
    await updateCart(services(), actor, { expectedVersion: 0, lines });
    const snapshot = await prepareConfirmation(services(), actor, {
      expectedVersion: 1,
      channel: "gui",
    });
    const order = await submitOrder(services(), actor, {
      snapshotId: snapshot.id,
      idempotencyKey: "tablecast-demo-order",
      approved: true,
    });
    expect(order.total).toBe(800);
    await callStaff(services(), actor);
    await requestBill(services(), actor);
    const state = await getTableState(services(), actor);
    expect(state.bill.due).toBe(800);
    expect(state.billRequested).toBe(true);
    const admin = await getAdminState(services(), staff);
    expect(admin.tables.map((table) => table.id)).toEqual([device.tableSessionId]);
    expect(admin.events).toEqual([]);
    expect((await getEvents(services(), { ...staff, tableSessionId: undefined })).events).toEqual(
      [],
    );
    expect((await getTableState(services(), device)).orders).toEqual([]);
  });

  it("WebSocket通知は対象デモだけへ届き、実営業と別デモへ送られない", async () => {
    // Given: 実営業と二つの独立したデモの通知接続。
    const { actor, staff, demo } = await setup();
    const other = await createDemo(services(), staff);
    const channels = await Promise.all(
      [staff.storeId, `tablecast-demo-${demo.id}`, `tablecast-demo-${other.id}`].map(
        async (name) => {
          const stub = env.TABLECAST_EVENTS.get(env.TABLECAST_EVENTS.idFromName(name));
          const response = await stub.fetch(
            new Request("http://tablecast-events/live", { headers: { Upgrade: "websocket" } }),
          );
          const socket = response.webSocket;
          if (!socket) throw new Error("通知接続を開始できません");
          const messages: string[] = [];
          socket.accept();
          socket.addEventListener("message", (event) => {
            messages.push(String(event.data));
          });
          return { socket, messages };
        },
      ),
    );
    try {
      // When: 一つのデモからスタッフを呼び出す。
      await callStaff(services(), actor);
      await expect.poll(() => channels[1]?.messages.length).toBe(1);
      // Then: 実営業ともう一つのデモには通知されない。
      expect(channels[0]?.messages).toEqual([]);
      expect(channels[2]?.messages).toEqual([]);
      await callStaff(services(), device);
      await expect.poll(() => channels[0]?.messages.length).toBe(1);
      expect(channels[1]?.messages).toHaveLength(1);
      expect(channels[2]?.messages).toEqual([]);
    } finally {
      for (const channel of channels) channel.socket.close(1000);
    }
  });

  it("下書き変更を明示再読込するまで保持し、変更後はカートだけ再評価して注文・会話を残す", async () => {
    const { actor, staff, demo } = await setup();
    await updateCart(services(), actor, { expectedVersion: 0, lines });
    const snapshot = await prepareConfirmation(services(), actor, {
      expectedVersion: 1,
      channel: "gui",
    });
    await submitOrder(services(), actor, {
      snapshotId: snapshot.id,
      idempotencyKey: "tablecast-demo-keep",
      approved: true,
    });
    await updateCart(services(), actor, { expectedVersion: 2, lines });
    const pending = await prepareConfirmation(services(), actor, {
      expectedVersion: 3,
      channel: "gui",
    });
    await fixtureDb.insert(business.tableEvents).values({
      store_id: actor.storeId,
      table_session_id: demo.id,
      kind: "voice.user",
      data_json: JSON.stringify({ text: "ほうじ茶をください" }),
      created_at: Date.now(),
    });
    const draft = await createDraft(services(), staff);
    const configuration = structuredClone(draft.configuration);
    configuration.products = configuration.products.map((product) =>
      product.id === "tea" ? { ...product, price: 700 } : product,
    );
    await updateDraft(services(), staff, draft.id, {
      expectedVersion: draft.version,
      configuration,
    });
    const changed = await updateDemo(services(), actor, {
      expectedVersion: 1,
      sourceDraftId: draft.id,
    });
    let state = await getTableState(services(), actor);
    expect(state.cart.total).toBe(1400);
    expect(state.orders[0]?.total).toBe(800);
    expect(state.events.some((event) => event.kind === "voice.user")).toBe(true);
    expect(state.snapshot).toBeNull();
    await expect(
      submitOrder(services(), actor, {
        snapshotId: pending.id,
        idempotencyKey: "tablecast-old-confirm",
        approved: true,
      }),
    ).rejects.toMatchObject({ code: "CONFIRMATION_STALE" });
    configuration.products = configuration.products.map((product) =>
      product.id === "tea" ? { ...product, price: 900 } : product,
    );
    await updateDraft(services(), staff, draft.id, {
      expectedVersion: draft.version + 1,
      configuration,
    });
    expect(
      (await getCatalog(services(), actor.storeId, demo.id)).configuration.products[0]?.price,
    ).toBe(700);
    await updateDemo(services(), actor, { expectedVersion: changed.version, reload: true });
    state = await getTableState(services(), actor);
    expect(state.cart.total).toBe(1800);
    expect((await getCatalog(services(), actor.storeId)).configuration.products[0]?.price).toBe(
      400,
    );
  });

  it("設定更新の競合と不正下書きでは以前の設定を維持する", async () => {
    const { actor, staff } = await setup();
    const results = await Promise.allSettled([
      updateDemo(services(), actor, { expectedVersion: 1, guestCount: 3 }),
      updateDemo(services(), actor, { expectedVersion: 1, guestCount: 4 }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const current = await getDemo(services(), actor);
    const draft = await createDraft(services(), staff);
    const invalid = structuredClone(draft.configuration);
    invalid.products = invalid.products.map((product) => ({ ...product, categoryId: "missing" }));
    await updateDraft(services(), staff, draft.id, {
      expectedVersion: draft.version,
      configuration: invalid,
    });
    await expect(
      updateDemo(services(), actor, { expectedVersion: current.version, sourceDraftId: draft.id }),
    ).rejects.toMatchObject({ code: "DEMO_CONFIGURATION_INVALID" });
    expect(await getDemo(services(), actor)).toEqual(current);
  });

  it("人数変更はプラン開始時刻を保ち、別プランへの変更で料金と開始時刻を更新する", async () => {
    // Given: 二つのプランを持つ下書きと、以前に開始したデモのプラン。
    const { actor, staff, cookie } = await setup();
    const draft = await createDraft(services(), staff);
    const configuration = structuredClone(draft.configuration);
    configuration.plans = [1000, 2000].map((pricePerPerson, index) => ({
      id: `tablecast-plan-${index}`,
      text: text(`プラン${index}`, `Plan ${index}`),
      pricePerPerson,
      durationMinutes: 60,
      lastOrderMinutesBeforeEnd: 5,
      productIds: ["tea"],
      categoryIds: [],
      tags: [],
      maxPerOrder: 10,
      maxTotalPerPerson: 20,
      intervalSeconds: 0,
      excludedOptionIds: [],
      includedOptionSurcharge: false,
    }));
    await updateDraft(services(), staff, draft.id, {
      expectedVersion: draft.version,
      configuration,
    });
    await updateDemo(services(), actor, {
      expectedVersion: 1,
      sourceDraftId: draft.id,
      planId: "tablecast-plan-0",
    });
    const initial = await getTableState(services(), actor);
    const startedAt = Date.now() - 60_000;
    await fixtureDb
      .update(business.tableSessions)
      .set({ plan_json: JSON.stringify({ ...initial.plan, startedAt }) })
      .where(eq(business.tableSessions.id, actor.demoId));

    // When: 人数だけを変更する。
    await updateDemo(services(), actor, { expectedVersion: 2, guestCount: 3 });
    const guests = await getTableState(services(), actor);
    // Then: プラン料金だけが再計算され、開始時刻は維持される。
    expect(guests.plan?.startedAt).toBe(startedAt);
    expect(guests.bill.planTotal).toBe(3000);
    await updateDemo(services(), actor, { expectedVersion: 3, planId: "tablecast-plan-1" });
    const switched = await getTableState(services(), actor);
    expect(switched.plan?.startedAt).toBeGreaterThan(startedAt);
    expect(switched.bill.planTotal).toBe(6000);

    // When: 明示的に存在しないプランIDを送る。
    const previousDemo = await getDemo(services(), actor);
    const response = await app.request(
      `http://localhost:3000/api/admin/stores/${actor.storeId}/demo/${actor.demoId}`,
      {
        method: "PATCH",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: 4, planId: "tablecast-missing-plan" }),
      },
      env,
    );
    // Then: 422で拒否し、設定版・選択プラン・料金・カート・音声状態を維持する。
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "PLAN_NOT_FOUND" } });
    expect(await getDemo(services(), actor)).toEqual(previousDemo);
    expect(await getTableState(services(), actor)).toEqual(switched);

    // When: 公開版には選択プランが存在しない。
    const removed = await updateDemo(services(), actor, {
      expectedVersion: 4,
      sourceDraftId: null,
    });
    // Then: プランなしへ戻り、プラン料を取り除く。
    expect(removed.planId).toBeNull();
    expect((await getTableState(services(), actor)).bill.planTotal).toBe(0);

    // 明示的なnullでも選択中のプランを解除できる。
    const selected = await updateDemo(services(), actor, {
      expectedVersion: removed.version,
      sourceDraftId: draft.id,
      planId: "tablecast-plan-0",
    });
    const cleared = await updateDemo(services(), actor, {
      expectedVersion: selected.version,
      planId: null,
    });
    expect(cleared.planId).toBeNull();
    expect((await getTableState(services(), actor)).bill.planTotal).toBe(0);
  });

  it("商品を削除した設定でもカートの行を保持し、修正するまで注文を確定できない", async () => {
    // Given: カートにある商品を削除した下書き。
    const { actor, staff } = await setup();
    await updateCart(services(), actor, { expectedVersion: 0, lines });
    const draft = await createDraft(services(), staff);
    await updateDraft(services(), staff, draft.id, {
      expectedVersion: draft.version,
      configuration: {
        ...draft.configuration,
        products: draft.configuration.products.filter((product) => product.id !== "tea"),
      },
    });
    // When: 下書き一式を取り込む。
    await updateDemo(services(), actor, { expectedVersion: 1, sourceDraftId: draft.id });
    // Then: 行を黙って削除せず、同じ業務判断で注文を拒否する。
    const state = await getTableState(services(), actor);
    expect(state.cart.lines).toMatchObject([
      { id: lines[0]?.id, productId: "tea", quantity: 2, missing: ["PRODUCT_NOT_FOUND"] },
    ]);
    expect(state.cart.complete).toBe(false);
    await expect(
      prepareConfirmation(services(), actor, {
        expectedVersion: state.cart.version,
        channel: "gui",
      }),
    ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
  });

  it("直近の会話が100件を超えてもデモの会計要求を保持する", async () => {
    // Given: 会計を依頼したデモ。
    const { actor } = await setup();
    await requestBill(services(), actor);
    // When: その後の会話で取得履歴の件数を超える。
    for (let offset = 0; offset < 101; offset += 10) {
      await fixtureDb.insert(business.tableEvents).values(
        Array.from({ length: Math.min(10, 101 - offset) }, () => ({
          store_id: actor.storeId,
          table_session_id: actor.demoId,
          kind: "voice.user",
          data_json: JSON.stringify({ text: "ありがとう" }),
          created_at: Date.now(),
        })),
      );
    }
    // Then: 会計要求の状態は履歴ページの範囲に依存しない。
    expect((await getTableState(services(), actor)).billRequested).toBe(true);
  });

  it("他店舗・他作成者・一般スタッフと通常APIからデモを操作できない", async () => {
    const { actor, cookie, demo } = await setup();
    await expect(getDemo(services(), { ...actor, storeId: "other" })).rejects.toMatchObject({
      code: "DEMO_NOT_FOUND",
    });
    await expect(getDemo(services(), { ...actor, userId: "other" })).rejects.toMatchObject({
      code: "DEMO_NOT_FOUND",
    });
    const normal = await app.request(
      `http://localhost:3000/api/admin/stores/tablecast-store/tables/${demo.id}`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(normal.status).toBe(404);
    await fixtureDb
      .update(auth.member)
      .set({ role: "member" })
      .where(eq(auth.member.id, "tablecast-member"));
    const forbidden = await app.request(
      `http://localhost:3000/api/admin/stores/tablecast-store/demo/${demo.id}/table`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(forbidden.status).toBe(403);
  });

  it("設定変更で音声資格と未送信確認を失効し、旧turnから書き込めない", async () => {
    const { actor, demo, staff } = await setup();
    const draft = await createDraft(services(), staff);
    await updateDraft(services(), staff, draft.id, {
      expectedVersion: draft.version,
      configuration: {
        ...draft.configuration,
        cast: {
          ...draft.configuration.cast,
          instructions: { ja: "デモ専用の接客", en: "Demo service" },
          voice: { ja: "tablecast-demo-voice-id", en: null },
          proactive: true,
        },
        products: draft.configuration.products.map((product) => ({ ...product, price: 777 })),
      },
    });
    await updateDemo(services(), actor, { expectedVersion: 1, sourceDraftId: draft.id });
    await setVoiceSession(services(), actor, "tablecast-demo-voice");
    const voice = await voiceActor(services(), "tablecast-demo-voice");
    expect(voice.demoId).toBe(demo.id);
    expect(await getVoiceConfiguration(services(), "tablecast-demo-voice")).toMatchObject({
      voice: "tablecast-demo-voice-id",
      proactive: true,
    });
    const tools = createCastTools(services(), voice, new AbortController().signal);
    expect(await tools.getCatalog.invoke({ query: "tea" })).toMatchObject({
      cast: "デモ専用の接客",
      products: [expect.objectContaining({ id: "tea", price: 777 })],
    });
    await updateDemo(services(), actor, { expectedVersion: 2, proactive: false });
    await expect(voiceActor(services(), "tablecast-demo-voice")).rejects.toMatchObject({
      code: "VOICE_SESSION_STALE",
    });
    await expect(
      updateCart(services(), voice, { expectedVersion: 0, lines }),
    ).rejects.toMatchObject({ code: "VOICE_SESSION_STALE" });
    await expect(tools.getCatalog.invoke({})).rejects.toMatchObject({
      code: "VOICE_SESSION_STALE",
    });
    expect((await getTableState(services(), actor)).voiceState).toBe("stopped");
  });

  it("リセットすると注文・会話・呼出しが消え、設定と人数は残る", async () => {
    const { actor } = await setup();
    await updateDemo(services(), actor, { expectedVersion: 1, guestCount: 4, proactive: true });
    await updateCart(services(), actor, { expectedVersion: 1, lines });
    const snapshot = await prepareConfirmation(services(), actor, {
      expectedVersion: 2,
      channel: "gui",
    });
    await submitOrder(services(), actor, {
      snapshotId: snapshot.id,
      idempotencyKey: "tablecast-demo-reset",
      approved: true,
    });
    await requestBill(services(), actor);
    await resetDemo(services(), actor, 2);
    const state = await getTableState(services(), actor);
    expect(state.orders).toEqual([]);
    expect(state.cart.lines).toEqual([]);
    expect(state.staffCalled).toBe(false);
    expect(state.billRequested).toBe(false);
    expect(state.events.map((event) => event.kind)).toEqual(["demo.reset"]);
    expect(state.guestCount).toBe(4);
    expect((await getDemo(services(), actor)).configuration.cast.proactive).toBe(true);
    expect(
      await fixtureDb
        .select()
        .from(business.confirmations)
        .where(
          and(
            eq(business.confirmations.store_id, actor.storeId),
            eq(business.confirmations.table_session_id, actor.demoId),
          ),
        ),
    ).toEqual([]);
  });
});
