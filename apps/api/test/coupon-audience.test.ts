import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { customerMemberships } from "../src/db/customer-schema";
import { user } from "../src/db/identity-schema";
import { customerCoupons } from "../src/db/rewards-schema";
import { stores } from "../src/db/table-schema";
import { previewCouponAudience } from "../src/modules/customer-coupons/audience";
import {
  couponAudienceSchema,
  couponConditionsSchema,
} from "../src/modules/customer-coupons/model";
import { listCustomerCoupons } from "../src/modules/customer-coupons/queries";
import {
  exchangeCustomerCoupon,
  issueCustomerCoupon,
} from "../src/modules/customer-coupons/use-cases/issue";
import { saveCouponRule } from "../src/modules/customer-coupons/use-cases/rules";
import { getPointVisit } from "../src/modules/customer-points/queries";
import {
  confirmCustomerPoints,
  correctCustomerPoints,
} from "../src/modules/customer-points/use-cases/allocation";
import { enrolCustomer } from "../src/modules/customers/service";
import { recordPayment } from "../src/modules/orders/use-cases/payment";
import { setupCouponCustomer } from "./coupon-fixture";
import { fixtureDb } from "./database-fixture";
import { configuration } from "./fixture";

it("発券条件はANDとORを各8件に制限し、任意の演算子とSQLを受け付けない", () => {
  const condition = { field: "visits", operator: "gte", value: 2 };
  expect(
    couponConditionsSchema.safeParse({
      all: Array.from({ length: 8 }, () => ({ ...condition })),
      any: [],
    }).success,
  ).toBe(true);
  expect(
    couponConditionsSchema.safeParse({
      all: Array.from({ length: 9 }, () => ({ ...condition })),
      any: [],
    }).success,
  ).toBe(false);
  expect(
    couponConditionsSchema.safeParse({
      all: [],
      any: Array.from({ length: 9 }, () => ({ ...condition })),
    }).success,
  ).toBe(false);
  expect(
    couponConditionsSchema.safeParse({ all: [{ ...condition, operator: "SQL" }], any: [] }).success,
  ).toBe(false);
  expect(couponConditionsSchema.safeParse({ all: [], any: [], sql: "1=1" }).success).toBe(false);
});

it("対象プレビューは全条件といずれかの条件を組み合わせ、来店なしと他店舗・退会を区別する", async () => {
  const { services, actor, rules, ruleId } = await setupCouponCustomer();
  await fixtureDb
    .insert(user)
    .values({ id: "tablecast-second-customer", name: "別会員", email: "second@example.test" });
  await enrolCustomer(services, {
    kind: "customer",
    storeId: actor.storeId,
    userId: "tablecast-second-customer",
  });
  await fixtureDb.insert(stores).values({
    id: "tablecast-audience-other-store",
    organization_id: "tablecast-fixture-other-org",
    name: "他店舗",
    config_json: JSON.stringify(configuration),
    updated_at: Date.now(),
  });
  await enrolCustomer(services, {
    kind: "customer",
    storeId: "tablecast-audience-other-store",
    userId: "tablecast-second-customer",
  });
  const preview = (
    conditions: Parameters<typeof previewCouponAudience>[2]["rules"]["conditions"],
  ) => previewCouponAudience(services, actor, { ruleId, rules: { ...rules, conditions } });
  expect(
    await preview({
      all: [
        { field: "visits", operator: "lte", value: 0 },
        { field: "spend", operator: "lte", value: 0 },
      ],
      any: [
        { field: "lastVisitAt", operator: "lte", value: 0 },
        { field: "joinedAt", operator: "lte", value: 0 },
      ],
    }),
  ).toMatchObject({ totalMembers: 2, eligible: 2, alreadyIssued: 0, notMatching: 0 });
  expect(
    await preview({
      all: [],
      any: [
        { field: "lastVisitAt", operator: "gte", value: 1 },
        { field: "joinedAt", operator: "lte", value: 0 },
      ],
    }),
  ).toMatchObject({ totalMembers: 2, eligible: 0, notMatching: 2 });
  expect(
    await preview({
      all: [{ field: "joinedAt", operator: "gte", value: Date.now() + 86400000 }],
      any: [],
    }),
  ).toMatchObject({ eligible: 0, notMatching: 2 });
  await fixtureDb
    .update(customerMemberships)
    .set({ active: false })
    .where(eq(customerMemberships.userId, "tablecast-second-customer"));
  expect(await preview({ all: [], any: [] })).toMatchObject({ totalMembers: 1, eligible: 1 });
  await expect(
    previewCouponAudience(services, { ...actor, role: "member" }, { ruleId, rules }),
  ).rejects.toMatchObject({ code: "ADMIN_REQUIRED", status: 403 });
  await expect(
    previewCouponAudience(
      services,
      { ...actor, storeId: "tablecast-audience-other-store" },
      { ruleId, rules },
    ),
  ).rejects.toMatchObject({ code: "COUPON_RULE_NOT_FOUND", status: 404 });
  expect(await fixtureDb.select().from(customerCoupons)).toEqual([]);
});

it("複合条件が成立した確認済み実績だけで一回発券し、プレビューと発行済み券面の版を保つ", async () => {
  const { services, actor, customer, ruleId, rules } = await setupCouponCustomer("visits");
  const conditional = {
    ...rules,
    conditions: {
      all: [
        { field: "visits" as const, operator: "gte" as const, value: 1 },
        { field: "spend" as const, operator: "gte" as const, value: 100 },
      ],
      any: [
        { field: "lastVisitAt" as const, operator: "gte" as const, value: Date.now() - 10000 },
        { field: "joinedAt" as const, operator: "lte" as const, value: 0 },
      ],
    },
    presentation: { layout: "portrait" as const, imageFit: "contain" as const },
  };
  await saveCouponRule(services, actor, {
    id: ruleId,
    expectedVersion: 1,
    active: true,
    rules: conditional,
  });
  expect(
    await previewCouponAudience(services, actor, { ruleId, rules: conditional }),
  ).toMatchObject({ eligible: 0, notMatching: 1 });
  const visit = await getPointVisit(services, actor);
  await confirmCustomerPoints(services, actor, {
    expectedVersion: visit.expectedVersion,
    participantIds: visit.participants.map((p) => p.id),
    idempotencyKey: "tablecast-audience-confirm",
  });
  expect((await listCustomerCoupons(services, customer, { limit: 20 })).coupons).toEqual([]);
  const payment = {
    amount: 100,
    kind: "adjustment" as const,
    reason: "対象条件の会計",
    idempotencyKey: "tablecast-audience-bill",
  };
  await recordPayment(services, actor, payment);
  await recordPayment(services, actor, payment);
  expect(
    await previewCouponAudience(services, actor, { ruleId, rules: conditional }),
  ).toMatchObject({ eligible: 0, alreadyIssued: 1, notMatching: 0 });
  await saveCouponRule(services, actor, {
    id: ruleId,
    expectedVersion: 2,
    active: true,
    rules: { ...conditional, presentation: { layout: "landscape", imageFit: "cover" } },
  });
  const page = await listCustomerCoupons(services, customer, { limit: 20 });
  expect(page.coupons).toHaveLength(1);
  expect(page.coupons[0]?.rules.presentation).toEqual({ layout: "portrait", imageFit: "contain" });
});

it("手動発行でも追加条件を再評価し、条件未達で発券や再送キーを消費しない", async () => {
  const { services, actor, rules, ruleId, membershipId } = await setupCouponCustomer();
  const conditional = {
    ...rules,
    conditions: {
      all: [{ field: "visits" as const, operator: "gte" as const, value: 1 }],
      any: [],
    },
  };
  await saveCouponRule(services, actor, {
    id: ruleId,
    expectedVersion: 1,
    active: true,
    rules: conditional,
  });
  const input = { ruleId, membershipId, idempotencyKey: crypto.randomUUID() };
  await expect(issueCustomerCoupon(services, actor, input)).rejects.toMatchObject({
    code: "COUPON_EXCHANGE_UNAVAILABLE",
    status: 409,
  });
  expect(await fixtureDb.select().from(customerCoupons)).toEqual([]);
  const visit = await getPointVisit(services, actor);
  await confirmCustomerPoints(services, actor, {
    expectedVersion: visit.expectedVersion,
    participantIds: visit.participants.map((p) => p.id),
    idempotencyKey: "tablecast-audience-manual-confirm",
  });
  const issued = await issueCustomerCoupon(services, actor, input);
  expect(await issueCustomerCoupon(services, actor, input)).toEqual(issued);
  expect(await fixtureDb.select().from(customerCoupons)).toHaveLength(1);
  expect(couponAudienceSchema.safeParse({ rules: conditional, ruleId }).success).toBe(true);
});

it("ポイント交換の追加条件が未達なら残高を消費せず、条件成立後に同じキーで交換できる", async () => {
  const { services, actor, customer, rules, ruleId, membershipId } =
    await setupCouponCustomer("exchange");
  await correctCustomerPoints(services, actor, {
    membershipId,
    delta: 5,
    reason: "交換用ポイント",
    idempotencyKey: crypto.randomUUID(),
  });
  const conditional = {
    ...rules,
    conditions: {
      all: [{ field: "visits" as const, operator: "gte" as const, value: 1 }],
      any: [],
    },
  };
  await saveCouponRule(services, actor, {
    id: ruleId,
    expectedVersion: 1,
    active: true,
    rules: conditional,
  });
  expect(
    await previewCouponAudience(services, actor, { ruleId, rules: conditional }),
  ).toMatchObject({ eligible: 0, notMatching: 1 });
  const key = crypto.randomUUID();
  await expect(exchangeCustomerCoupon(services, customer, ruleId, key)).rejects.toMatchObject({
    code: "COUPON_EXCHANGE_UNAVAILABLE",
  });
  const visit = await getPointVisit(services, actor);
  await confirmCustomerPoints(services, actor, {
    expectedVersion: visit.expectedVersion,
    participantIds: visit.participants.map((p) => p.id),
    idempotencyKey: "tablecast-audience-exchange-confirm",
  });
  expect(
    await previewCouponAudience(services, actor, { ruleId, rules: conditional }),
  ).toMatchObject({ eligible: 1, notMatching: 0 });
  const issued = await exchangeCustomerCoupon(services, customer, ruleId, key);
  expect(await exchangeCustomerCoupon(services, customer, ruleId, key)).toEqual(issued);
  expect(
    await previewCouponAudience(services, actor, { ruleId, rules: conditional }),
  ).toMatchObject({ eligible: 0, notMatching: 1 });
  expect(await fixtureDb.select().from(customerCoupons)).toHaveLength(1);
});
