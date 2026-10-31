import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import {
  customerCoupons,
  customerPointAllocations,
  customerPointEntries,
  customerPointVisits,
} from "../src/db/rewards-schema";
import { restaurantTables, stores, tableSessions } from "../src/db/table-schema";
import { customerRecommendationContext } from "../src/modules/customer-memory/queries";
import { noPointRules } from "../src/modules/customer-points/model";
import {
  createCustomerVisitCode,
  joinCustomerVisit,
  leaveCustomerVisit,
} from "../src/modules/customer-visits/service";
import { updateCustomerPreferences } from "../src/modules/customers/service";
import { setVoiceSession } from "../src/modules/voice/service";
import { setupCouponCustomer } from "./coupon-fixture";
import { fixtureDb } from "./database-fixture";
import { configuration, device } from "./fixture";

it("接客対象の確認済み来店・ポイント・有効券だけを件数上限付きで返す", async () => {
  const { services, customer, membershipId, rules, ruleId } = await setupCouponCustomer();
  const now = Date.now();
  const previousVisit = now - 86_400_000;
  await fixtureDb.batch([
    fixtureDb.insert(stores).values({
      id: "tablecast-context-other-store",
      organization_id: "tablecast-fixture-other-org",
      name: "別店舗",
      config_json: JSON.stringify(configuration),
      updated_at: now,
    }),
    fixtureDb.insert(restaurantTables).values({
      id: "tablecast-context-other-table",
      store_id: "tablecast-context-other-store",
      name: "別店舗01",
    }),
    fixtureDb.insert(tableSessions).values([
      {
        id: "tablecast-context-confirmed",
        store_id: device.storeId,
        table_id: "tablecast-table",
        locale: "ja",
        guest_count: 1,
        opened_at: previousVisit,
        status: "closed",
        closed_at: previousVisit + 1000,
      },
      {
        id: "tablecast-context-unconfirmed",
        store_id: device.storeId,
        table_id: "tablecast-table",
        locale: "ja",
        guest_count: 1,
        status: "closed",
        opened_at: now - 2000,
        closed_at: now - 1500,
      },
      {
        id: "tablecast-context-other",
        store_id: "tablecast-context-other-store",
        table_id: "tablecast-context-other-table",
        locale: "ja",
        guest_count: 1,
        opened_at: now - 1000,
      },
    ]),
    fixtureDb.insert(customerPointVisits).values([
      {
        sessionId: "tablecast-context-confirmed",
        storeId: device.storeId,
        rulesJson: JSON.stringify(noPointRules),
        confirmedAt: previousVisit + 1000,
      },
      {
        sessionId: "tablecast-context-unconfirmed",
        storeId: device.storeId,
        rulesJson: JSON.stringify(noPointRules),
      },
      {
        sessionId: "tablecast-context-other",
        storeId: "tablecast-context-other-store",
        rulesJson: JSON.stringify(noPointRules),
        confirmedAt: now,
      },
      {
        sessionId: device.tableSessionId,
        storeId: device.storeId,
        rulesJson: JSON.stringify(noPointRules),
        confirmedAt: now,
      },
    ]),
    fixtureDb.insert(customerPointAllocations).values([
      {
        sessionId: "tablecast-context-confirmed",
        membershipId,
        storeId: device.storeId,
        position: 0,
        amount: 300,
        points: 3,
      },
      {
        sessionId: "tablecast-context-unconfirmed",
        membershipId,
        storeId: device.storeId,
        position: 0,
        amount: 500,
        points: 5,
      },
      {
        sessionId: "tablecast-context-other",
        membershipId,
        storeId: "tablecast-context-other-store",
        position: 0,
        amount: 900,
        points: 9,
      },
      {
        sessionId: device.tableSessionId,
        membershipId,
        storeId: device.storeId,
        position: 0,
        amount: 100,
        points: 1,
      },
    ]),
    fixtureDb.insert(customerPointEntries).values([
      {
        id: "tablecast-context-points",
        storeId: device.storeId,
        membershipId,
        delta: 3,
        kind: "award",
        reference: "context-award",
        reason: "来店付与",
        createdBy: "system",
        createdAt: now,
      },
      {
        id: "tablecast-context-correction",
        storeId: device.storeId,
        membershipId,
        delta: -1,
        kind: "correction",
        reference: "context-correction",
        reason: "訂正",
        createdBy: "system",
        createdAt: now,
      },
      {
        id: "tablecast-context-other-points",
        storeId: "tablecast-context-other-store",
        membershipId,
        delta: 99,
        kind: "award",
        reference: "context-other",
        reason: "別店舗",
        createdBy: "system",
        createdAt: now,
      },
    ]),
    fixtureDb.insert(customerCoupons).values(
      Array.from({ length: 7 }, (_, index) => ({
        id: `tablecast-context-coupon-${index}`,
        storeId: device.storeId,
        membershipId,
        ruleId,
        ruleVersion: 1,
        snapshotJson: JSON.stringify({
          ...rules,
          title: { ja: `特典${index}`, en: `Reward ${index}` },
          endsAt: now + (index + 1) * 60_000,
        }),
        state: "available" as const,
        issuanceKey: `context-${index}`,
        mutationId: `context-${index}`,
        createdAt: now,
      })),
    ),
    fixtureDb.insert(customerCoupons).values(
      (["expired", "future", "used", "revoked", "requested", "other-store"] as const).map(
        (kind) => ({
          id: `tablecast-context-${kind}`,
          storeId: kind === "other-store" ? "tablecast-context-other-store" : device.storeId,
          membershipId,
          ruleId,
          ruleVersion: 1,
          snapshotJson: JSON.stringify({
            ...rules,
            title: { ja: "案内しない券", en: "Hidden coupon" },
            ...(kind === "expired" ? { endsAt: now - 1 } : {}),
            ...(kind === "future" ? { startsAt: now + 10_000 } : {}),
          }),
          state:
            kind === "used" || kind === "revoked" || kind === "requested"
              ? kind
              : ("available" as const),
          requestedSessionId: kind === "requested" ? "tablecast-context-other" : null,
          issuanceKey: `context-${kind}`,
          mutationId: `context-${kind}`,
          createdAt: now,
        }),
      ),
    ),
  ]);
  const context = await customerRecommendationContext(services, device);
  expect(context.customer).toEqual({
    displayName: "店員",
    confirmedVisits: { count: 1, lastVisitedAt: previousVisit },
    pointsBalance: 2,
    coupons: Array.from({ length: 5 }, (_, index) => ({
      title: `特典${index}`,
      description: "100円引き",
      minimumYen: 100,
      discountKind: "fixed",
      discountValue: 100,
      maximumYen: 500,
      endsAt: now + (index + 1) * 60_000,
    })),
    moreCoupons: true,
  });
  expect(JSON.stringify(context.customer)).not.toContain(rules.imageKey);
  for (const locale of ["en", "zh-Hans", "ko"]) {
    await fixtureDb
      .update(tableSessions)
      .set({ locale })
      .where(eq(tableSessions.id, device.tableSessionId));
    expect(
      (await customerRecommendationContext(services, device)).customer?.coupons[0],
    ).toMatchObject({
      title: "Reward 0",
      description: rules.description.en,
    });
  }
  await updateCustomerPreferences(services, customer, {
    revision: 1,
    shareCompanions: true,
    useMemories: false,
    saveMemories: false,
  });
  expect(await customerRecommendationContext(services, device)).toMatchObject({
    mode: "permission-disabled",
    memories: [],
    consumption: [],
    customer: null,
  });
});

it("途中参加は停止した音声を失効させ、明示再開後の文脈と退出後の秘匿を分ける", async () => {
  const { services, customer } = await setupCouponCustomer();
  await fixtureDb
    .update(tableSessions)
    .set({
      voice_state: "active",
      voice_session_id: "tablecast-context-old",
      active_turn_id: "tablecast-context-turn",
    })
    .where(eq(tableSessions.id, device.tableSessionId));
  const old = {
    ...device,
    kind: "voice" as const,
    voiceSessionId: "tablecast-context-old",
    turnId: "tablecast-context-turn",
  };
  expect((await customerRecommendationContext(services, old)).customer?.displayName).toBe("店員");
  await leaveCustomerVisit(services, customer, device.tableSessionId);
  expect(
    await fixtureDb
      .select({ state: tableSessions.voice_state, id: tableSessions.voice_session_id })
      .from(tableSessions)
      .where(eq(tableSessions.id, device.tableSessionId))
      .get(),
  ).toEqual({ state: "stopped", id: null });
  await expect(customerRecommendationContext(services, old)).rejects.toMatchObject({
    code: "VOICE_SESSION_STALE",
  });
  expect(await customerRecommendationContext(services, device)).toMatchObject({
    mode: "shared",
    customer: null,
  });
  const code = await createCustomerVisitCode(services, { ...device, deviceId: "tablecast-device" });
  await joinCustomerVisit(services, customer.userId, code.code);
  expect(
    await fixtureDb
      .select({ state: tableSessions.voice_state, id: tableSessions.voice_session_id })
      .from(tableSessions)
      .where(eq(tableSessions.id, device.tableSessionId))
      .get(),
  ).toEqual({ state: "stopped", id: null });
  await setVoiceSession(services, device, "tablecast-context-resumed");
  const resumed = {
    ...device,
    kind: "voice" as const,
    voiceSessionId: "tablecast-context-resumed",
  };
  expect((await customerRecommendationContext(services, resumed)).customer?.displayName).toBe(
    "店員",
  );
  await expect(customerRecommendationContext(services, old)).rejects.toMatchObject({
    code: "VOICE_SESSION_STALE",
  });
});
