import { env } from "cloudflare:workers";
import { assert } from "vitest";
import { saveCouponRule } from "../src/modules/customer-coupons/use-cases/rules";
import { createCustomerVisitCode, joinCustomerVisit } from "../src/modules/customer-visits/service";
import { enrolCustomer } from "../src/modules/customers/service";
import { createApiServices } from "../src/platform/context";
import { device, setupFixture } from "./fixture";

export async function setupCouponRule(
  trigger: "enrol" | "exchange" | "manual" | "spend" | "visits" = "manual",
) {
  const { staff, cookie } = await setupFixture();
  const services = createApiServices(env);
  const actor = { ...staff, tableSessionId: device.tableSessionId };
  const customer = { kind: "customer", storeId: device.storeId, userId: staff.userId } as const;
  const imageKey = `tablecast/uploads/${"a".repeat(64)}.webp`;
  const imageSource = { generated: false, description: "テスト券面" };
  await env.TABLECAST_MEDIA.put(imageKey, new Uint8Array([1]), {
    customMetadata: {
      storeId: actor.storeId,
      metadata: JSON.stringify({ imageKind: "illustration", imageSource }),
    },
  });
  const rules = {
    title: { ja: "ご来店特典", en: "Visit reward" },
    description: { ja: "100円引き", en: "JPY 100 off" },
    imageKey,
    imageKind: "illustration" as const,
    imageSource,
    startsAt: Date.now() - 10000,
    endsAt: Date.now() + 86400000,
    minimumYen: 100,
    discountKind: "fixed" as const,
    discountValue: 100,
    maximumYen: 500,
    trigger,
    threshold: trigger === "exchange" ? 5 : 1,
  };
  const ruleId = crypto.randomUUID();
  await saveCouponRule(services, actor, { id: ruleId, expectedVersion: 0, active: true, rules });
  return { services, actor, customer, ruleId, rules, cookie };
}

export async function setupCouponCustomer(
  trigger: Parameters<typeof setupCouponRule>[0] = "manual",
) {
  const prepared = await setupCouponRule(trigger);
  const { services, customer } = prepared;
  const enrolled = await enrolCustomer(services, customer);
  assert(enrolled.membership);
  const code = await createCustomerVisitCode(services, { ...device, deviceId: "tablecast-device" });
  await joinCustomerVisit(services, customer.userId, code.code);
  return { ...prepared, membershipId: enrolled.membership.id };
}
