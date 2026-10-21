import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { customerMemberships } from "../src/db/customer-schema";
import {
  customerCouponEvents,
  customerCoupons,
  customerCouponUses,
  customerPointAllocations,
  customerPointEntries,
  customerPointVisits,
} from "../src/db/rewards-schema";
import { payments, tableEvents } from "../src/db/table-schema";
import { listCustomerCoupons } from "../src/modules/customer-coupons/queries";
import { applyCustomerCoupon } from "../src/modules/customer-coupons/use-cases/apply";
import { cancelCustomerCouponUse } from "../src/modules/customer-coupons/use-cases/cancel";
import { issueCustomerCoupon } from "../src/modules/customer-coupons/use-cases/issue";
import { saveCouponRule } from "../src/modules/customer-coupons/use-cases/rules";
import { requestCustomerCoupon } from "../src/modules/customer-coupons/use-cases/selection";
import { getPointVisit } from "../src/modules/customer-points/queries";
import { confirmCustomerPoints } from "../src/modules/customer-points/use-cases/allocation";
import { enrolCustomer } from "../src/modules/customers/service";
import { updateCart } from "../src/modules/orders/use-cases/cart";
import { prepareConfirmation } from "../src/modules/orders/use-cases/confirmation";
import { recordPayment } from "../src/modules/orders/use-cases/payment";
import { changeOrderStatus } from "../src/modules/orders/use-cases/status";
import { submitOrder } from "../src/modules/orders/use-cases/submit";
import { getTableState } from "../src/modules/tables/queries";
import { setupCouponCustomer, setupCouponRule } from "./coupon-fixture";
import { fixtureDb } from "./database-fixture";
import { device } from "./fixture";

function failCouponIssuance() {
  return env.TABLECAST_DB.exec(
    "CREATE TRIGGER tablecast_fail_coupon_issuance BEFORE INSERT ON customer_coupon_events WHEN NEW.kind='issued' BEGIN SELECT RAISE(ABORT,'tablecast-test-coupon-issuance-failure'); END",
  );
}
function restoreCouponIssuance() {
  return env.TABLECAST_DB.exec("DROP TRIGGER tablecast_fail_coupon_issuance");
}
function rewardRows() {
  return fixtureDb.batch([
    fixtureDb.select().from(customerMemberships),
    fixtureDb.select().from(customerPointVisits),
    fixtureDb.select().from(customerPointAllocations),
    fixtureDb.select().from(customerPointEntries),
    fixtureDb.select().from(customerCoupons),
    fixtureDb.select().from(customerCouponUses),
    fixtureDb.select().from(customerCouponEvents),
    fixtureDb.select().from(payments),
    fixtureDb.select().from(tableEvents),
  ]);
}

it("入会特典の記録失敗では会員も券も作らず、再送で一度だけ入会・発行する", async () => {
  const { services, customer } = await setupCouponRule("enrol");
  const before = await rewardRows();
  await failCouponIssuance();
  await expect(enrolCustomer(services, customer)).rejects.toThrow(
    "tablecast-test-coupon-issuance-failure",
  );
  expect(await rewardRows()).toEqual(before);
  await restoreCouponIssuance();
  await enrolCustomer(services, customer);
  await enrolCustomer(services, customer);
  expect(await fixtureDb.select().from(customerMemberships)).toHaveLength(1);
  expect(await fixtureDb.select().from(customerCoupons)).toHaveLength(1);
  expect(await fixtureDb.select().from(customerCouponEvents)).toHaveLength(1);
});

it("来店特典の記録失敗では確認・旧来店補完・配分・卓の版も戻し、再送で一度だけ確定する", async () => {
  const { services, actor, customer } = await setupCouponCustomer("visits");
  const visit = await getPointVisit(services, actor);
  const input = {
    expectedVersion: visit.expectedVersion,
    participantIds: visit.participants.map((p) => p.id),
    idempotencyKey: "tablecast-atomic-points",
  };
  const beforeTable = await getTableState(services, actor);
  const before = await rewardRows();
  await failCouponIssuance();
  await expect(confirmCustomerPoints(services, actor, input)).rejects.toThrow(
    "tablecast-test-coupon-issuance-failure",
  );
  expect(await getTableState(services, actor)).toEqual(beforeTable);
  expect(await rewardRows()).toEqual(before);
  await restoreCouponIssuance();
  await confirmCustomerPoints(services, actor, input);
  const committed = await rewardRows();
  await confirmCustomerPoints(services, actor, input);
  expect(await rewardRows()).toEqual(committed);
  expect((await listCustomerCoupons(services, customer, { limit: 20 })).coupons).toHaveLength(1);
  expect((await getPointVisit(services, actor)).allocations).toHaveLength(1);
  expect(await fixtureDb.select().from(customerPointEntries)).toHaveLength(1);
});

it.each(["payment", "adjustment"] as const)(
  "累計特典の記録失敗では会計%sとポイント訂正も戻し、再送を重複計上しない",
  async (kind) => {
    const { services, actor, customer } = await setupCouponCustomer("spend");
    const visit = await getPointVisit(services, actor);
    await confirmCustomerPoints(services, actor, {
      expectedVersion: visit.expectedVersion,
      participantIds: visit.participants.map((p) => p.id),
      idempotencyKey: "tablecast-atomic-confirm",
    });
    const table = await getTableState(services, device);
    const cart = await updateCart(services, device, {
      expectedVersion: table.cart.version,
      lines: [{ id: "tablecast-atomic-tea", productId: "tea", quantity: 1, selections: [] }],
    });
    const snapshot = await prepareConfirmation(services, device, {
      expectedVersion: cart.cart.version,
      channel: "gui",
    });
    const order = await submitOrder(services, device, {
      snapshotId: snapshot.id,
      idempotencyKey: "tablecast-atomic-order",
      approved: true,
    });
    await changeOrderStatus(services, actor, order.id, "accepted");
    await changeOrderStatus(services, actor, order.id, "served");
    expect((await listCustomerCoupons(services, customer, { limit: 20 })).coupons).toEqual([]);
    const input = {
      amount: kind === "payment" ? 400 : 100,
      kind,
      reason: "追加分の会計",
      idempotencyKey: "tablecast-atomic-payment",
    };
    const beforeTable = await getTableState(services, actor);
    const before = await rewardRows();
    await failCouponIssuance();
    await expect(recordPayment(services, actor, input)).rejects.toThrow(
      "tablecast-test-coupon-issuance-failure",
    );
    expect(await getTableState(services, actor)).toEqual(beforeTable);
    expect(await rewardRows()).toEqual(before);
    await restoreCouponIssuance();
    await recordPayment(services, actor, input);
    const committed = await rewardRows();
    await recordPayment(services, actor, input);
    expect(await rewardRows()).toEqual(committed);
    expect(await fixtureDb.select().from(payments)).toHaveLength(1);
    expect((await getPointVisit(services, actor)).allocations[0]?.amount).toBe(
      kind === "payment" ? 400 : 500,
    );
    expect((await listCustomerCoupons(services, customer, { limit: 20 })).coupons).toHaveLength(1);
  },
);

it("取消による累計特典の記録失敗では元の券・割引・配分を保ち、再送で一度だけ取り消す", async () => {
  const { services, actor, customer, membershipId, ruleId, rules } = await setupCouponCustomer();
  await saveCouponRule(services, actor, {
    id: "tablecast-atomic-spend-rule",
    expectedVersion: 0,
    active: true,
    rules: { ...rules, trigger: "spend", threshold: 1000 },
  });
  await recordPayment(services, actor, {
    amount: 1000,
    kind: "adjustment",
    reason: "会計",
    idempotencyKey: "tablecast-atomic-bill",
  });
  const coupon = await issueCustomerCoupon(services, actor, {
    ruleId,
    membershipId,
    idempotencyKey: "tablecast-atomic-manual-coupon",
  });
  await requestCustomerCoupon(services, customer, coupon.id, device.tableSessionId);
  const use = await applyCustomerCoupon(services, actor, {
    couponId: coupon.id,
    idempotencyKey: "tablecast-atomic-apply",
    expectedVersion: (await getTableState(services, actor)).cart.version,
  });
  await recordPayment(services, actor, {
    amount: 900,
    kind: "payment",
    reason: "会計",
    idempotencyKey: "tablecast-atomic-paid",
  });
  const visit = await getPointVisit(services, actor);
  await confirmCustomerPoints(services, actor, {
    expectedVersion: visit.expectedVersion,
    participantIds: visit.participants.map((p) => p.id),
    idempotencyKey: "tablecast-atomic-cancel-confirm",
  });
  const beforeTable = await getTableState(services, actor);
  const input = {
    useId: use.useId,
    expectedVersion: beforeTable.cart.version,
    idempotencyKey: "tablecast-atomic-cancel",
    reason: "割引取消",
  };
  const before = await rewardRows();
  await failCouponIssuance();
  await expect(cancelCustomerCouponUse(services, actor, input)).rejects.toThrow(
    "tablecast-test-coupon-issuance-failure",
  );
  expect(await getTableState(services, actor)).toEqual(beforeTable);
  expect(await rewardRows()).toEqual(before);
  await restoreCouponIssuance();
  await cancelCustomerCouponUse(services, actor, input);
  const committed = await rewardRows();
  await cancelCustomerCouponUse(services, actor, input);
  expect(await rewardRows()).toEqual(committed);
  expect((await getPointVisit(services, actor)).allocations[0]?.amount).toBe(1000);
  expect((await listCustomerCoupons(services, customer, { limit: 20 })).coupons).toHaveLength(2);
  expect(await fixtureDb.select().from(payments)).toHaveLength(4);
});
