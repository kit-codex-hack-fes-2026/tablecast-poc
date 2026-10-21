import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { assert, expect, it } from "vitest";
import type { Actor } from "../src/modules/auth/model";
import { user } from "../src/db/identity-schema";
import { customerPointEntries } from "../src/db/rewards-schema";
import { tableSessions } from "../src/db/table-schema";
import { getCustomerPoints, getPointVisit } from "../src/modules/customer-points/queries";
import { confirmCustomerPoints } from "../src/modules/customer-points/use-cases/allocation";
import { correctCustomerPoints } from "../src/modules/customer-points/use-cases/corrections";
import { setPointPolicy } from "../src/modules/customer-points/use-cases/policy";
import { createCustomerVisitCode, joinCustomerVisit } from "../src/modules/customer-visits/service";
import { enrolCustomer } from "../src/modules/customers/service";
import { updateCart } from "../src/modules/orders/use-cases/cart";
import { prepareConfirmation } from "../src/modules/orders/use-cases/confirmation";
import { recordPayment } from "../src/modules/orders/use-cases/payment";
import { changeOrderStatus } from "../src/modules/orders/use-cases/status";
import { submitOrder } from "../src/modules/orders/use-cases/submit";
import { getTableState } from "../src/modules/tables/queries";
import { closeTable, openTable } from "../src/modules/tables/use-cases/lifecycle";
import { type ApiServices, createApiServices } from "../src/platform/context";
import { DomainError } from "../src/platform/errors";
import { fixtureDb } from "./database-fixture";
import { device, setupFixture } from "./fixture";
async function setup(kind: "spend" | "visit" = "spend") {
  const { staff } = await setupFixture();
  const services = createApiServices(env);
  const admin = { ...staff, tableSessionId: device.tableSessionId };
  const old = await fixtureDb
    .select()
    .from(tableSessions)
    .where(eq(tableSessions.id, device.tableSessionId))
    .get();
  assert(old?.table_id);
  await closeTable(services, admin);
  await setPointPolicy(services, admin, {
    expectedVersion: 0,
    enabled: true,
    kind,
    points: 1,
    unitYen: 100,
  });
  const session = await openTable(services, staff, {
    tableId: old.table_id,
    guestCount: 2,
    locale: "ja",
  });
  const actor = { ...admin, tableSessionId: session.id };
  const tablet = { ...device, tableSessionId: session.id, deviceId: "tablecast-device" };
  const customer = { kind: "customer", storeId: device.storeId, userId: staff.userId } as const;
  const other = { ...customer, userId: "tablecast-points-other" };
  await fixtureDb.insert(user).values({
    id: other.userId,
    name: "同行者",
    email: "points-other@example.test",
    updatedAt: new Date(),
  });
  await enrolCustomer(services, customer);
  await enrolCustomer(services, other);
  const code = await createCustomerVisitCode(services, tablet);
  await joinCustomerVisit(services, customer.userId, code.code);
  await joinCustomerVisit(services, other.userId, code.code);
  return { services, actor, customer, other, tablet };
}
async function prepareTea(services: ApiServices, tablet: Actor, lineId: string) {
  const before = await getTableState(services, tablet);
  const cart = await updateCart(services, tablet, {
    expectedVersion: before.cart.version,
    lines: [{ id: lineId, productId: "tea", quantity: 1, selections: [] }],
  });
  return prepareConfirmation(services, tablet, {
    expectedVersion: cart.cart.version,
    channel: "gui",
  });
}
it("均等配分の円端数は参加順とし、同時確認でも一度だけ付与する", async () => {
  const { services, actor, customer, other } = await setup();
  await recordPayment(services, actor, {
    amount: 401,
    kind: "adjustment",
    reason: "確定会計",
    idempotencyKey: "amount",
  });
  await recordPayment(services, actor, {
    amount: 401,
    kind: "payment",
    reason: "会計",
    idempotencyKey: "paid",
  });
  const visit = await getPointVisit(services, actor);
  const input = {
    expectedVersion: visit.expectedVersion,
    participantIds: visit.participants.map((p) => p.id),
    idempotencyKey: crypto.randomUUID(),
  };
  const results = await Promise.all([
    confirmCustomerPoints(services, actor, input),
    confirmCustomerPoints(services, actor, input),
  ]);
  expect(results[0].allocations.map((a) => a.amount)).toEqual([201, 200]);
  expect((await getCustomerPoints(services, customer, { limit: 20 })).balance).toBe(2);
  expect((await getCustomerPoints(services, other, { limit: 20 })).balance).toBe(2);
  expect(await fixtureDb.select().from(customerPointEntries)).toHaveLength(2);
});
it("設定変更は将来の来店にだけ適用し、QR参加だけでは付与しない", async () => {
  const { services, actor, customer } = await setup("visit");
  await setPointPolicy(services, actor, {
    expectedVersion: 1,
    enabled: true,
    kind: "visit",
    points: 99,
    unitYen: 100,
  });
  expect((await getPointVisit(services, actor)).rules.points).toBe(1);
  expect((await getCustomerPoints(services, customer, { limit: 20 })).balance).toBe(0);
  const visit = await getPointVisit(services, actor);
  await confirmCustomerPoints(services, actor, {
    expectedVersion: visit.expectedVersion,
    participantIds: visit.participants.map((p) => p.id),
    idempotencyKey: crypto.randomUUID(),
  });
  expect((await getCustomerPoints(services, customer, { limit: 20 })).balance).toBe(1);
});
it("会計訂正を配分とポイントへ差分反映し、不足残高を将来へ持ち越す", async () => {
  const { services, actor, customer } = await setup();
  await recordPayment(services, actor, {
    amount: 400,
    kind: "adjustment",
    reason: "会計",
    idempotencyKey: "amount",
  });
  await recordPayment(services, actor, {
    amount: 400,
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
  const membership = visit.participants[0];
  assert(membership);
  await correctCustomerPoints(services, actor, {
    membershipId: membership.membershipId,
    delta: -3,
    reason: "誤付与の訂正",
    idempotencyKey: crypto.randomUUID(),
  });
  await recordPayment(services, actor, {
    amount: -400,
    kind: "payment",
    reason: "返金",
    idempotencyKey: "refund",
  });
  await recordPayment(services, actor, {
    amount: -300,
    kind: "adjustment",
    reason: "会計訂正",
    idempotencyKey: "correction",
  });
  expect((await getCustomerPoints(services, customer, { limit: 20 })).balance).toBe(-3);
  expect((await getPointVisit(services, actor)).allocations.map((a) => a.amount)).toEqual([50, 50]);
  expect((await getTableState(services, actor)).bill.due).toBe(100);
});
it("付与対象ゼロを明示確定すると追加注文でも付与せず、会員APIからスタッフ操作は実行できない", async () => {
  const { services, actor, customer, tablet } = await setup();
  const visit = await getPointVisit(services, actor);
  const result = await confirmCustomerPoints(services, actor, {
    expectedVersion: visit.expectedVersion,
    participantIds: [],
    idempotencyKey: crypto.randomUUID(),
  });
  expect(result.allocations).toEqual([]);
  const snapshot = await prepareTea(services, tablet, "no-recipient");
  await submitOrder(services, tablet, {
    snapshotId: snapshot.id,
    idempotencyKey: "no-recipient",
    approved: true,
  });
  expect((await getPointVisit(services, actor)).allocations).toEqual([]);
  expect((await getCustomerPoints(services, customer, { limit: 20 })).balance).toBe(0);
  await expect(
    setPointPolicy(
      services,
      { kind: "device", storeId: actor.storeId },
      { enabled: true, kind: "visit", points: 10, unitYen: 100, expectedVersion: 1 },
    ),
  ).rejects.toMatchObject({ code: "ADMIN_REQUIRED" });
});

it("別来店で同じ会計訂正キーを使っても配分と残高を両方更新する", async () => {
  const { services, actor, customer, other, tablet } = await setup();
  let currentActor = actor;
  let currentTablet = tablet;
  for (let visitIndex = 0; visitIndex < 2; visitIndex++) {
    const visit = await getPointVisit(services, currentActor);
    await confirmCustomerPoints(services, currentActor, {
      expectedVersion: visit.expectedVersion,
      participantIds: visit.participants.map((p) => p.id),
      idempotencyKey: "same-confirmation",
    });
    await recordPayment(services, currentActor, {
      amount: 200,
      kind: "adjustment",
      reason: "後からの訂正",
      idempotencyKey: "same-correction",
    });
    expect((await getPointVisit(services, currentActor)).allocations.map((a) => a.points)).toEqual([
      1, 1,
    ]);
    expect((await getCustomerPoints(services, customer, { limit: 20 })).balance).toBe(
      visitIndex + 1,
    );
    await recordPayment(services, currentActor, {
      amount: 200,
      kind: "payment",
      reason: "会計",
      idempotencyKey: "same-payment",
    });
    await closeTable(services, currentActor);
    if (visitIndex === 0) {
      const next = await openTable(services, actor, {
        tableId: "tablecast-table",
        guestCount: 2,
        locale: "ja",
      });
      currentActor = { ...actor, tableSessionId: next.id };
      currentTablet = { ...tablet, tableSessionId: next.id };
      const code = await createCustomerVisitCode(services, currentTablet);
      await joinCustomerVisit(services, customer.userId, code.code);
      await joinCustomerVisit(services, other.userId, code.code);
    }
  }
});

it.each([
  { label: "0円", initialOrder: false, total: 400, points: 4 },
  { label: "400円", initialOrder: true, total: 800, points: 8 },
])(
  "$labelで確定した後の通常追加注文を固定対象へ配分し、精算・閉卓後も残高を保つ",
  async ({ initialOrder, total, points }) => {
    const { services, actor, customer, other, tablet } = await setup();
    if (initialOrder) {
      const snapshot = await prepareTea(services, tablet, "before");
      const order = await submitOrder(services, tablet, {
        snapshotId: snapshot.id,
        idempotencyKey: "before",
        approved: true,
      });
      await changeOrderStatus(services, actor, order.id, "accepted");
      await changeOrderStatus(services, actor, order.id, "served");
      await recordPayment(services, actor, {
        amount: 400,
        kind: "payment",
        reason: "会計",
        idempotencyKey: "before",
      });
    }
    const visit = await getPointVisit(services, actor);
    const recipient = visit.participants.find((p) => p.name !== "同行者");
    assert(recipient);
    const confirmation = {
      expectedVersion: visit.expectedVersion,
      participantIds: [recipient.id],
      idempotencyKey: crypto.randomUUID(),
    };
    await confirmCustomerPoints(services, actor, confirmation);

    const snapshot = await prepareTea(services, tablet, "after");
    const input = { snapshotId: snapshot.id, idempotencyKey: "after", approved: true as const };
    const results = await Promise.all([
      submitOrder(services, tablet, input),
      submitOrder(services, tablet, input),
    ]);
    assert(results[0]);
    expect(results[0].id).toBe(results[1]?.id);
    await changeOrderStatus(services, actor, results[0].id, "accepted");
    await changeOrderStatus(services, actor, results[0].id, "served");
    await recordPayment(services, actor, {
      amount: 400,
      kind: "payment",
      reason: "追加分の会計",
      idempotencyKey: "after",
    });
    expect((await confirmCustomerPoints(services, actor, confirmation)).allocations).toMatchObject([
      { membershipId: recipient.membershipId, amount: total, points },
    ]);
    const closed = await closeTable(services, actor);
    expect(closed.status).toBe("closed");
    expect(closed.bill).toMatchObject({ orderedTotal: total, due: 0 });
    expect(await getCustomerPoints(services, customer, { limit: 20 })).toMatchObject({
      balance: points,
      totals: { visits: 1, allocatedYen: total },
    });
    expect((await getCustomerPoints(services, other, { limit: 20 })).balance).toBe(0);
    const entries = await fixtureDb.select().from(customerPointEntries);
    expect(entries.filter((entry) => entry.kind === "correction")).toHaveLength(1);
  },
);

it.each([
  { label: "未受注の取消", accepted: false, status: "cancelled" as const },
  { label: "受注後の取消", accepted: true, status: "cancelled" as const },
  { label: "注文の拒否", accepted: false, status: "rejected" as const },
])(
  "確定後の追加注文を$labelすると複数会員の購入額とポイントを一度だけ戻す",
  async ({ accepted, status }) => {
    const { services, actor, customer, other, tablet } = await setup();
    const visit = await getPointVisit(services, actor);
    await confirmCustomerPoints(services, actor, {
      expectedVersion: visit.expectedVersion,
      participantIds: visit.participants.map((p) => p.id),
      idempotencyKey: crypto.randomUUID(),
    });
    const snapshot = await prepareTea(services, tablet, "cancel");
    const order = await submitOrder(services, tablet, {
      snapshotId: snapshot.id,
      idempotencyKey: "cancel",
      approved: true,
    });
    expect((await getPointVisit(services, actor)).allocations.map((a) => a.amount)).toEqual([
      200, 200,
    ]);
    if (accepted) await changeOrderStatus(services, actor, order.id, "accepted");
    await changeOrderStatus(services, actor, order.id, status);
    await changeOrderStatus(services, actor, order.id, status);
    expect((await getPointVisit(services, actor)).allocations.map((a) => a.amount)).toEqual([0, 0]);
    expect((await getCustomerPoints(services, customer, { limit: 20 })).balance).toBe(0);
    expect((await getCustomerPoints(services, other, { limit: 20 })).balance).toBe(0);
    const entries = await fixtureDb.select().from(customerPointEntries);
    expect(
      entries
        .filter((entry) => entry.kind === "correction")
        .map((entry) => entry.delta)
        .toSorted((left, right) => left - right),
    ).toEqual([-2, -2, 2, 2]);
    expect((await closeTable(services, actor)).bill).toMatchObject({ orderedTotal: 0, due: 0 });
  },
);

it("追加注文と会計調整が競合しても成立した会計だけを複数会員へ配分する", async () => {
  const { services, actor, customer, other, tablet } = await setup();
  const visit = await getPointVisit(services, actor);
  await confirmCustomerPoints(services, actor, {
    expectedVersion: visit.expectedVersion,
    participantIds: visit.participants.map((p) => p.id),
    idempotencyKey: crypto.randomUUID(),
  });
  const snapshot = await prepareTea(services, tablet, "concurrent");
  const results = await Promise.allSettled([
    submitOrder(services, tablet, {
      snapshotId: snapshot.id,
      idempotencyKey: "concurrent",
      approved: true,
    }),
    recordPayment(services, actor, {
      amount: 101,
      kind: "adjustment",
      reason: "会計訂正",
      idempotencyKey: "concurrent",
    }),
  ]);
  expect(results.some((result) => result.status === "fulfilled")).toBe(true);
  for (const failure of results.filter((result) => result.status === "rejected")) {
    const reason: unknown = failure.reason;
    assert(reason instanceof DomainError);
    expect(reason.code).toBeOneOf(["CONFIRMATION_STALE", "BILLING_CONFLICT"]);
  }
  const table = await getTableState(services, actor);
  const amount = table.bill.orderedTotal + table.bill.adjustmentTotal;
  const expected = new Map([
    [101, { amounts: [51, 50], points: 0 }],
    [400, { amounts: [200, 200], points: 2 }],
    [501, { amounts: [251, 250], points: 2 }],
  ]).get(amount);
  assert(expected);
  expect((await getPointVisit(services, actor)).allocations.map((a) => a.amount)).toEqual(
    expected.amounts,
  );
  expect((await getCustomerPoints(services, customer, { limit: 20 })).balance).toBe(
    expected.points,
  );
  expect((await getCustomerPoints(services, other, { limit: 20 })).balance).toBe(expected.points);
});

it("ポイント訂正の保存が失敗すると追加注文・カート消去・台帳をまとめて戻す", async () => {
  const { services, actor, tablet } = await setup();
  const visit = await getPointVisit(services, actor);
  await confirmCustomerPoints(services, actor, {
    expectedVersion: visit.expectedVersion,
    participantIds: visit.participants.map((p) => p.id),
    idempotencyKey: crypto.randomUUID(),
  });
  const snapshot = await prepareTea(services, tablet, "failure");
  const before = await getTableState(services, tablet);
  const entries = await fixtureDb.select().from(customerPointEntries);
  await env.TABLECAST_DB.exec(
    "CREATE TRIGGER tablecast_fail_point_correction BEFORE INSERT ON customer_point_entries WHEN NEW.kind='correction' BEGIN SELECT RAISE(ABORT,'tablecast-point-failure'); END",
  );
  await expect(
    submitOrder(services, tablet, {
      snapshotId: snapshot.id,
      idempotencyKey: "failure",
      approved: true,
    }),
  ).rejects.toThrow("tablecast-point-failure");
  expect(await getTableState(services, tablet)).toEqual(before);
  expect(await fixtureDb.select().from(customerPointEntries)).toEqual(entries);
  expect((await getPointVisit(services, actor)).allocations.map((a) => a.amount)).toEqual([0, 0]);
});
