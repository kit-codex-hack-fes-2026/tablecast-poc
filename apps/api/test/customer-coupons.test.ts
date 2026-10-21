import { eq } from "drizzle-orm";
import { assert, expect, it } from "vitest";
import {
  customerCoupons,
  customerCouponUses,
  customerPointEntries,
} from "../src/db/rewards-schema";
import { payments } from "../src/db/table-schema";
import { listCustomerCoupons } from "../src/modules/customer-coupons/queries";
import {
  applyCustomerCoupon,
  cancelCustomerCouponUse,
} from "../src/modules/customer-coupons/use-cases/apply";
import {
  exchangeCustomerCoupon,
  issueCustomerCoupon,
} from "../src/modules/customer-coupons/use-cases/issue";
import {
  revokeCustomerCoupon,
  saveCouponRule,
} from "../src/modules/customer-coupons/use-cases/rules";
import { requestCustomerCoupon } from "../src/modules/customer-coupons/use-cases/selection";
import { getCustomerPoints, getPointVisit } from "../src/modules/customer-points/queries";
import {
  confirmCustomerPoints,
  correctCustomerPoints,
} from "../src/modules/customer-points/use-cases/allocation";
import { enrolCustomer } from "../src/modules/customers/service";
import { updateCart } from "../src/modules/orders/use-cases/cart";
import { prepareConfirmation, submitOrder } from "../src/modules/orders/use-cases/confirmation";
import { recordPayment } from "../src/modules/orders/use-cases/payment";
import { changeOrderStatus } from "../src/modules/orders/use-cases/status";
import { getTableState } from "../src/modules/tables/queries";
import { closeTable } from "../src/modules/tables/use-cases/lifecycle";
import { setupCouponCustomer as setup } from "./coupon-fixture";
import { fixtureDb } from "./database-fixture";
import { device } from "./fixture";
it("入会券は一度だけ発行し、設定変更後も発行時の画像と条件を保持する", async () => {
  const { services, actor, customer, ruleId, rules } = await setup("enrol");
  await enrolCustomer(services, customer);
  const before = await listCustomerCoupons(services, customer, { limit: 20 });
  expect(before.coupons).toHaveLength(1);
  await saveCouponRule(services, actor, {
    id: ruleId,
    expectedVersion: 1,
    active: false,
    rules: { ...rules, discountValue: 999 },
  });
  const after = await listCustomerCoupons(services, customer, { limit: 20 });
  expect(after.coupons[0]?.rules).toEqual(rules);
  assert(after.coupons[0]);
  await revokeCustomerCoupon(services, actor, after.coupons[0].id, "誤発行");
  expect((await listCustomerCoupons(services, customer, { limit: 20 })).coupons[0]?.state).toBe(
    "revoked",
  );
});
it("ポイント確定後の追加注文で累計条件に達すると通常入金とその再送で特典を一枚だけ発行する", async () => {
  const { services, actor, customer } = await setup("spend");
  const visit = await getPointVisit(services, actor);
  await confirmCustomerPoints(services, actor, {
    expectedVersion: visit.expectedVersion,
    participantIds: visit.participants.map((p) => p.id),
    idempotencyKey: crypto.randomUUID(),
  });
  expect((await listCustomerCoupons(services, customer, { limit: 20 })).coupons).toEqual([]);
  const before = await getTableState(services, device);
  const cart = await updateCart(services, device, {
    expectedVersion: before.cart.version,
    lines: [{ id: "reward-tea", productId: "tea", quantity: 1, selections: [] }],
  });
  const snapshot = await prepareConfirmation(services, device, {
    expectedVersion: cart.cart.version,
    channel: "gui",
  });
  const order = await submitOrder(services, device, {
    snapshotId: snapshot.id,
    idempotencyKey: "reward-order",
    approved: true,
  });
  await changeOrderStatus(services, actor, order.id, "accepted");
  await changeOrderStatus(services, actor, order.id, "served");
  const input = {
    amount: 400,
    kind: "payment" as const,
    reason: "追加分の会計",
    idempotencyKey: "reward-payment",
  };
  await recordPayment(services, actor, input);
  await recordPayment(services, actor, input);
  expect((await listCustomerCoupons(services, customer, { limit: 20 })).coupons).toHaveLength(1);
  expect((await getCustomerPoints(services, customer, { limit: 20 })).totals.allocatedYen).toBe(
    400,
  );
});
it("同時交換は残高を超えず、再送はルール失効後も同じ発行を返す", async () => {
  const { services, actor, customer, ruleId, rules, membershipId } = await setup("exchange");
  await correctCustomerPoints(services, actor, {
    membershipId,
    delta: 5,
    reason: "付与訂正",
    idempotencyKey: crypto.randomUUID(),
  });
  const keys = [crypto.randomUUID(), crypto.randomUUID()];
  const results = await Promise.allSettled(
    keys.map((key) => exchangeCustomerCoupon(services, customer, ruleId, key)),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect((await getCustomerPoints(services, customer, { limit: 20 })).balance).toBe(0);
  expect(await fixtureDb.select().from(customerCoupons)).toHaveLength(1);
  expect(await fixtureDb.select().from(customerPointEntries)).toHaveLength(2);
  const index = results.findIndex((r) => r.status === "fulfilled");
  assert(keys[index]);
  await saveCouponRule(services, actor, { id: ruleId, expectedVersion: 1, active: false, rules });
  await expect(
    exchangeCustomerCoupon(services, customer, ruleId, keys[index]),
  ).resolves.toHaveProperty("id");
});
it("同一会計への同時適用は一枚に限り、元の使用を指定して割引を一度だけ取り消す", async () => {
  const { services, actor, customer, ruleId, membershipId } = await setup();
  await recordPayment(services, actor, {
    amount: 1000,
    kind: "adjustment",
    reason: "会計",
    idempotencyKey: "bill",
  });
  const coupons = await Promise.all(
    [1, 2].map(() =>
      issueCustomerCoupon(services, actor, {
        ruleId,
        membershipId,
        idempotencyKey: crypto.randomUUID(),
      }),
    ),
  );
  for (const coupon of coupons)
    await requestCustomerCoupon(services, customer, coupon.id, device.tableSessionId);
  const table = await getTableState(services, actor);
  const inputs = coupons.map((coupon) => ({
    couponId: coupon.id,
    expectedVersion: table.cart.version,
    idempotencyKey: crypto.randomUUID(),
  }));
  const results = await Promise.allSettled(
    inputs.map((input) => applyCustomerCoupon(services, actor, input)),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect((await getTableState(services, actor)).bill.due).toBe(900);
  expect(await fixtureDb.select().from(customerCouponUses)).toHaveLength(1);
  const index = results.findIndex((r) => r.status === "fulfilled");
  const input = inputs[index];
  assert(input);
  const retry = await applyCustomerCoupon(services, actor, input);
  expect(await fixtureDb.select().from(payments)).toHaveLength(2);
  await expect(
    recordPayment(services, actor, {
      amount: 1,
      kind: "adjustment",
      reason: "後調整",
      idempotencyKey: "later",
    }),
  ).rejects.toMatchObject({ code: "COUPON_CANCEL_REQUIRED" });
  const current = await getTableState(services, actor);
  const cancel = {
    useId: retry.useId,
    expectedVersion: current.cart.version,
    idempotencyKey: crypto.randomUUID(),
    reason: "会計取消",
  };
  const cancellations = await Promise.all([
    cancelCustomerCouponUse(services, actor, cancel),
    cancelCustomerCouponUse(services, actor, cancel),
  ]);
  expect(cancellations).toEqual([{ cancelled: true }, { cancelled: true }]);
  await cancelCustomerCouponUse(services, actor, cancel);
  expect((await getTableState(services, actor)).bill.due).toBe(1000);
  expect(await fixtureDb.select().from(payments)).toHaveLength(3);
  const used = await fixtureDb.select().from(customerCouponUses).get();
  expect(used?.cancelledAt).not.toBeNull();
});
it("期限・最低金額・別店舗を検証し、他会員は券を申請できない", async () => {
  const { services, actor, customer, ruleId, membershipId } = await setup();
  const coupon = await issueCustomerCoupon(services, actor, {
    ruleId,
    membershipId,
    idempotencyKey: crypto.randomUUID(),
  });
  await requestCustomerCoupon(services, customer, coupon.id, device.tableSessionId);
  await expect(
    applyCustomerCoupon(services, actor, {
      couponId: coupon.id,
      expectedVersion: (await getTableState(services, actor)).cart.version,
      idempotencyKey: crypto.randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "COUPON_MINIMUM_AMOUNT" });
  await expect(
    requestCustomerCoupon(
      services,
      { ...customer, userId: "missing" },
      coupon.id,
      device.tableSessionId,
    ),
  ).rejects.toBeDefined();
  await expect(
    issueCustomerCoupon(
      services,
      { ...actor, storeId: "other" },
      { ruleId, membershipId, idempotencyKey: crypto.randomUUID() },
    ),
  ).rejects.toBeDefined();
  const row = await fixtureDb
    .select()
    .from(customerCoupons)
    .where(eq(customerCoupons.id, coupon.id))
    .get();
  assert(row);
  await fixtureDb
    .update(customerCoupons)
    .set({
      snapshotJson: JSON.stringify({ ...JSON.parse(row.snapshotJson), endsAt: Date.now() - 1 }),
    })
    .where(eq(customerCoupons.id, coupon.id));
  await expect(
    requestCustomerCoupon(services, customer, coupon.id, device.tableSessionId),
  ).rejects.toMatchObject({ code: "COUPON_UNAVAILABLE" });
});
it("来店特典はスタッフ確認で発行し、確認の再送で増えない", async () => {
  const { services, actor, customer } = await setup("visits");
  expect((await listCustomerCoupons(services, customer, { limit: 20 })).coupons).toHaveLength(0);
  const visit = await getPointVisit(services, actor);
  const input = {
    expectedVersion: visit.expectedVersion,
    participantIds: visit.participants.map((p) => p.id),
    idempotencyKey: crypto.randomUUID(),
  };
  await confirmCustomerPoints(services, actor, input);
  await confirmCustomerPoints(services, actor, input);
  expect((await listCustomerCoupons(services, customer, { limit: 20 })).coupons).toHaveLength(1);
});
it("他店舗の券面画像を発行ルールへ設定できない", async () => {
  const { services, actor, rules } = await setup();
  await expect(
    saveCouponRule(
      services,
      { ...actor, storeId: "other" },
      { id: crypto.randomUUID(), expectedVersion: 0, active: true, rules },
    ),
  ).rejects.toMatchObject({ code: "IMAGE_FORBIDDEN" });
});

it("割合割引は円切捨てと上限を守り、終了後の会計訂正でも累計特典を一度だけ発行する", async () => {
  const { services, actor, customer, ruleId, rules, membershipId } = await setup();
  await saveCouponRule(services, actor, {
    id: ruleId,
    expectedVersion: 1,
    active: true,
    rules: { ...rules, discountKind: "percent", discountValue: 33, maximumYen: 200 },
  });
  const spendId = crypto.randomUUID();
  await saveCouponRule(services, actor, {
    id: spendId,
    expectedVersion: 0,
    active: true,
    rules: { ...rules, trigger: "spend", threshold: 900 },
  });
  await recordPayment(services, actor, {
    amount: 1001,
    kind: "adjustment",
    reason: "会計",
    idempotencyKey: "amount",
  });
  const coupon = await issueCustomerCoupon(services, actor, {
    ruleId,
    membershipId,
    idempotencyKey: crypto.randomUUID(),
  });
  await requestCustomerCoupon(services, customer, coupon.id, device.tableSessionId);
  const use = await applyCustomerCoupon(services, actor, {
    couponId: coupon.id,
    idempotencyKey: crypto.randomUUID(),
    expectedVersion: (await getTableState(services, actor)).cart.version,
  });
  expect((await getTableState(services, actor)).bill.due).toBe(801);
  await recordPayment(services, actor, {
    amount: 801,
    kind: "payment",
    reason: "会計",
    idempotencyKey: "paid",
  });
  const visit = await getPointVisit(services, actor);
  await confirmCustomerPoints(services, actor, {
    expectedVersion: visit.expectedVersion,
    participantIds: visit.participants.map((p) => p.id),
    idempotencyKey: crypto.randomUUID(),
  });
  expect((await listCustomerCoupons(services, customer, { limit: 20 })).coupons).toHaveLength(1);
  await closeTable(services, actor);
  const current = await getTableState(services, actor);
  await cancelCustomerCouponUse(services, actor, {
    useId: use.useId,
    expectedVersion: current.cart.version,
    idempotencyKey: crypto.randomUUID(),
    reason: "終了後の訂正",
  });
  expect((await listCustomerCoupons(services, customer, { limit: 20 })).coupons).toHaveLength(2);
  await recordPayment(services, actor, {
    amount: 200,
    kind: "payment",
    reason: "差額",
    idempotencyKey: "extra",
  });
  expect((await getTableState(services, actor)).status).toBe("closed");
  expect((await getTableState(services, actor)).bill.due).toBe(0);
});
