import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDraft,
  updateDraft,
  validateDraft,
} from "../src/modules/configuration/use-cases/drafts";
import { publishDraft } from "../src/modules/configuration/use-cases/publish";
import { updateCart } from "../src/modules/orders/use-cases/cart";
import { prepareConfirmation, submitOrder } from "../src/modules/orders/use-cases/confirmation";
import { recordPayment } from "../src/modules/orders/use-cases/payment";
import { getEvents } from "../src/modules/stores/queries";
import { getTableState } from "../src/modules/tables/queries";
import { callStaff } from "../src/modules/tables/use-cases/presentation";
import { createApiServices } from "../src/platform/context";
import { planSchema, tableStateSchema } from "../src/schema";
import { device, deviceToken, setupFixture, text } from "./fixture";

afterEach(() => vi.restoreAllMocks());

const teaLine = { id: "line-1", productId: "tea", quantity: 2, selections: [] };

const tea = [teaLine];

async function confirmed() {
  await updateCart(createApiServices(env), device, { expectedVersion: 0, lines: tea });
  return prepareConfirmation(createApiServices(env), device, {
    expectedVersion: 1,
    channel: "gui",
  });
}

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
  const order = await submitOrder(createApiServices(env), device, {
    snapshotId: snapshot.id,
    idempotencyKey: "tablecast-after-plan-last-order",
    approved: true,
  });
  expect(order.total).toBe(800);
  expect(order.snapshot.lines.every((line) => !line.planCovered)).toBe(true);
  await expect(
    updateCart(createApiServices(env), device, {
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
describe("実D1の注文契約", () => {
  it("必須選択を下書きとして保持し、同じ行を完成して税込価格を計算する", async () => {
    await setupFixture();
    const draft = await updateCart(createApiServices(env), device, {
      expectedVersion: 0,
      lines: [{ id: "coffee-line", productId: "coffee", quantity: 1, selections: [] }],
    });
    expect(draft.cart.complete).toBe(false);
    expect(draft.cart.lines[0]?.missing).toContain("milk");
    await expect(
      prepareConfirmation(createApiServices(env), device, { expectedVersion: 1, channel: "gui" }),
    ).rejects.toMatchObject({ code: "CART_INCOMPLETE" });
    const state = await updateCart(createApiServices(env), device, {
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
});
describe("実D1の注文契約", () => {
  it("同時カート変更の片方だけ成立し、不成立バッチからイベントを作らない", async () => {
    await setupFixture();
    const results = await Promise.allSettled([
      updateCart(createApiServices(env), device, { expectedVersion: 0, lines: tea }),
      updateCart(createApiServices(env), device, {
        expectedVersion: 0,
        lines: [{ ...teaLine, id: "other", quantity: 1 }],
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await getTableState(createApiServices(env), device)).cart.version).toBe(1);
    expect(
      (await getEvents(createApiServices(env), device)).events.filter(
        (event) => event.kind === "cart.updated",
      ),
    ).toHaveLength(1);
  });
});
describe("実D1の注文契約", () => {
  it.each([false, undefined])("承認値が%sのHTTP注文は保存せず拒否する", async (approved) => {
    await setupFixture();
    const snapshot = await confirmed();
    const response = await exports.default.fetch(
      new Request("http://localhost:3000/api/table/orders", {
        method: "POST",
        headers: { Cookie: `tablecast.device=${deviceToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshotId: snapshot.id,
          idempotencyKey: "tablecast-no-approval",
          approved,
        }),
      }),
    );
    expect(response.status).toBe(422);
    const state = await getTableState(createApiServices(env), device);
    expect(state.orders).toEqual([]);
    expect(state.cart.lines).toHaveLength(1);
  });
});
describe("実D1の注文契約", () => {
  it("古い確認を拒否し、同じ冪等キーの並行送信と再送で注文を一件に保つ", async () => {
    await setupFixture();
    const old = await confirmed();
    await updateCart(createApiServices(env), device, { expectedVersion: 1, lines: tea });
    await expect(
      submitOrder(createApiServices(env), device, {
        snapshotId: old.id,
        idempotencyKey: "tablecast-order-old",
        approved: true,
      }),
    ).rejects.toMatchObject({ code: "CONFIRMATION_STALE" });
    const snapshot = await prepareConfirmation(createApiServices(env), device, {
      expectedVersion: 2,
      channel: "gui",
    });
    const payload = {
      snapshotId: snapshot.id,
      idempotencyKey: "tablecast-order-once",
      approved: true as const,
    };
    const orders = await Promise.all([
      submitOrder(createApiServices(env), device, payload),
      submitOrder(createApiServices(env), device, payload),
    ]);
    expect(orders[0]?.id).toBe(orders[1]?.id);
    expect((await submitOrder(createApiServices(env), device, payload)).id).toBe(orders[0]?.id);
    const state = await getTableState(createApiServices(env), device);
    expect(state.orders).toHaveLength(1);
    expect(state.bill.orderedTotal).toBe(800);
    expect(state.cart.lines).toHaveLength(0);
  });
});
describe("実D1の注文契約", () => {
  it("途中の制約違反でカート・注文・イベントがすべてロールバックする", async () => {
    await setupFixture();
    const snapshot = await confirmed();
    await env.TABLECAST_DB.exec(
      "CREATE TRIGGER tablecast_fail_order BEFORE INSERT ON orders BEGIN SELECT RAISE(ABORT,'tablecast-test-failure'); END",
    );
    await expect(
      submitOrder(createApiServices(env), device, {
        snapshotId: snapshot.id,
        idempotencyKey: "tablecast-failed-order",
        approved: true,
      }),
    ).rejects.toThrow("tablecast-test-failure");
    const state = await getTableState(createApiServices(env), device);
    expect(state.cart.version).toBe(1);
    expect(state.cart.total).toBe(800);
    expect(state.orders).toHaveLength(0);
    expect(state.events.some((e) => e.kind === "order.submitted")).toBe(false);
  });
});
describe("実D1の注文契約", () => {
  it("価格改ざんと別店舗・別卓への読み書きをHTTP入口で拒否する", async () => {
    await setupFixture();
    const request = new Request("http://localhost:3000/api/table/cart", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: `tablecast.device=${deviceToken}` },
      body: JSON.stringify({ expectedVersion: 0, lines: [{ ...teaLine, price: 1 }] }),
    });
    expect((await exports.default.fetch(request)).status).toBe(422);
    await expect(
      getTableState(createApiServices(env), { ...device, storeId: "another-store" }),
    ).rejects.toMatchObject({ code: "TABLE_NOT_FOUND" });
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
});
describe("実D1の注文契約", () => {
  it("注文済みだけを請求し、未送信カートと冪等支払を分離する", async () => {
    const { staff } = await setupFixture();
    const snapshot = await confirmed();
    await submitOrder(createApiServices(env), device, {
      snapshotId: snapshot.id,
      idempotencyKey: "tablecast-paid-order",
      approved: true,
    });
    await updateCart(createApiServices(env), device, { expectedVersion: 2, lines: tea });
    const input = {
      amount: 800,
      kind: "payment" as const,
      reason: "モック支払",
      idempotencyKey: "tablecast-pay-once",
    };
    await recordPayment(createApiServices(env), staff, input);
    const state = await recordPayment(createApiServices(env), staff, input);
    expect(state.bill.due).toBe(0);
    expect(state.bill.paidTotal).toBe(800);
    expect(state.bill.cartTotal).toBe(800);
  });
});
describe("実D1の注文契約", () => {
  it("設定公開は人の権限と検証版が必要で、価格変更後の確認を失効させる", async () => {
    const { staff } = await setupFixture();
    const snapshot = await confirmed();
    let draft = await createDraft(createApiServices(env), staff);
    draft.configuration.products = draft.configuration.products.map((product) =>
      product.id === "tea" ? { ...product, price: 450 } : product,
    );
    draft = await updateDraft(createApiServices(env), staff, draft.id, {
      expectedVersion: 1,
      configuration: draft.configuration,
    });
    await validateDraft(createApiServices(env), staff, draft.id, 2);
    const input = {
      expectedVersion: 2,
      baseVersion: 1,
      idempotencyKey: "tablecast-publish-once",
      approved: true as const,
    };
    await expect(
      publishDraft(
        createApiServices(env),
        { ...staff, kind: "mcp", canWrite: true },
        draft.id,
        input,
      ),
    ).rejects.toMatchObject({ code: "HUMAN_APPROVAL_REQUIRED" });
    await publishDraft(createApiServices(env), staff, draft.id, input);
    await publishDraft(createApiServices(env), staff, draft.id, input);
    await expect(
      submitOrder(createApiServices(env), device, {
        snapshotId: snapshot.id,
        idempotencyKey: "tablecast-stale-price",
        approved: true,
      }),
    ).rejects.toMatchObject({ code: "CONFIRMATION_STALE" });
  });
});
describe("実D1の注文契約", () => {
  it("DO通知の接続がなくても永続カーソルから欠落と重複を復旧する", async () => {
    await setupFixture();
    const before = await getEvents(createApiServices(env), device);
    await callStaff(createApiServices(env), device);
    await updateCart(createApiServices(env), device, { expectedVersion: 0, lines: tea });
    const after = await getEvents(createApiServices(env), device, before.cursor);
    expect(after.events.map((e) => e.kind)).toEqual(["staff.called", "cart.updated"]);
    expect((await getEvents(createApiServices(env), device, after.cursor)).events).toHaveLength(0);
  });
});

it.each([
  ["商品削除", "PRODUCT_NOT_FOUND"],
  ["売切", "SOLD_OUT"],
  ["選択肢削除", "OPTION_NOT_FOUND"],
])("公開した%sでカートが無効になっても画面取得と修正ができる", async (change, code) => {
  const { staff } = await setupFixture();
  await updateCart(createApiServices(env), device, {
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
  const old = await prepareConfirmation(createApiServices(env), device, {
    expectedVersion: 1,
    channel: "gui",
  });
  let draft = await createDraft(createApiServices(env), staff);
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
  draft = await updateDraft(createApiServices(env), staff, draft.id, {
    expectedVersion: 1,
    configuration: draft.configuration,
  });
  await validateDraft(createApiServices(env), staff, draft.id, 2);
  await publishDraft(createApiServices(env), staff, draft.id, {
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
    submitOrder(createApiServices(env), device, {
      snapshotId: old.id,
      idempotencyKey: "tablecast-invalid-catalog-order",
      approved: true,
    }),
  ).rejects.toMatchObject({ code });
  await updateCart(createApiServices(env), device, {
    expectedVersion: displayed.cart.version,
    lines: tea,
  });
  const repaired = await getTableState(createApiServices(env), device);
  expect(repaired.cart.complete).toBe(true);
  expect(
    (
      await prepareConfirmation(createApiServices(env), device, {
        expectedVersion: repaired.cart.version,
        channel: "gui",
      })
    ).total,
  ).toBe(800);
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
  await callStaff(createApiServices(env), device);
  expect(await notification).toContain("cursor");
  const cursor = (await getEvents(createApiServices(env), device)).cursor;
  socket.close(1000);
  await updateCart(createApiServices(env), device, { expectedVersion: 0, lines: tea });
  const recovered = await getEvents(createApiServices(env), device, cursor);
  expect(recovered.events.map((event) => event.kind)).toEqual(["cart.updated"]);
});
