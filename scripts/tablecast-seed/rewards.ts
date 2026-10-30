import { business, identity } from "@tablecast/api/db";
import { couponRuleSchema, customerConsentVersion, pointRulesSchema } from "@tablecast/api/schema";
import { and, eq, like, sql } from "drizzle-orm";
import { type BatchItem } from "drizzle-orm/batch";
import { createHash } from "node:crypto";
import { type Owner, type SeedDatabase, type Store } from "../tablecast-seed-data.ts";

// 名前・メール・購買履歴は全て架空。個人記憶や共有への同意は作らない。
const members = [
  ["藤井 菜月", 0],
  ["中村 航", 1],
  ["Alex Morgan", 2],
  ["田中 美咲", 3],
  ["林 佳音", 3],
  ["山本 健", 4],
  ["Sam Taylor", 5],
  ["小林 葵", 6],
  ["鈴木 遥", 8],
  ["高橋 悠人", 10],
  ["佐々木 凛", 2],
  ["森 結衣", 0],
] as const;

function seedId(key: string) {
  const hex = createHash("sha256").update(`tablecast-plugin-seed:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** 会員の閾値前後・ポイント残高・発券条件を既存schemaで用意する。 */
export async function seedPluginRewards(db: SeedDatabase, store: Store, owner: Owner) {
  const joinedAt = Date.UTC(2026, 7, 31);
  const rules = pointRulesSchema.parse({ enabled: true, kind: "visit", points: 10, unitYen: 100 });
  const visits = await db
    .select({
      id: business.tableSessions.id,
      closedAt: business.tableSessions.closed_at,
      paid: sql<number>`coalesce(sum(CASE WHEN ${business.payments.kind}='payment' THEN ${business.payments.amount} ELSE 0 END),0)`.mapWith(
        Number,
      ),
    })
    .from(business.tableSessions)
    .leftJoin(business.payments, eq(business.payments.table_session_id, business.tableSessions.id))
    .where(
      and(
        eq(business.tableSessions.store_id, store.id),
        like(business.tableSessions.id, `${store.id}-plugin-history-2026-10-%`),
      ),
    )
    .groupBy(business.tableSessions.id)
    .orderBy(business.tableSessions.id);
  let offset = 0;
  const policy = await db
    .select({ version: business.customerPointPolicies.version })
    .from(business.customerPointPolicies)
    .where(eq(business.customerPointPolicies.storeId, store.id))
    .limit(1)
    .get();
  if (!policy)
    await db.insert(business.customerPointPolicies).values({
      storeId: store.id,
      version: 1,
      rulesJson: JSON.stringify(rules),
      createdAt: joinedAt,
      createdBy: owner.userId,
    });
  for (const [index, [name, count]] of members.entries()) {
    const membershipId = seedId(`${store.id}:member:${index}`);
    const userId = `tablecast-plugin-customer-${store.id}-${index}`;
    const statements: BatchItem<"sqlite">[] = [
      db
        .insert(identity.user)
        .values({
          id: userId,
          name,
          email: `tablecast.member.${index}@${store.id}.invalid`,
          emailVerified: false,
          createdAt: new Date(joinedAt),
          updatedAt: new Date(joinedAt),
        })
        .onConflictDoNothing(),
      db
        .insert(business.customerMemberships)
        .values({
          id: membershipId,
          storeId: store.id,
          userId,
          active: index !== 10,
          shareCompanions: false,
          useMemories: false,
          saveMemories: false,
          consentVersion: customerConsentVersion,
          joinedAt,
          updatedAt: joinedAt,
        })
        .onConflictDoNothing(),
    ];
    for (let number = 0; number < count; number++) {
      const visit = visits[offset++];
      if (!visit?.closedAt) throw new Error("会員実績に対応する閉卓履歴がありません。");
      const participantId = seedId(`${visit.id}:participant`);
      statements.push(
        db
          .insert(business.customerVisitParticipants)
          .values({
            id: participantId,
            storeId: store.id,
            sessionId: visit.id,
            membershipId,
            joinedAt: visit.closedAt - 80 * 60_000,
            leftAt: visit.closedAt,
          })
          .onConflictDoNothing(),
        db
          .insert(business.customerPointVisits)
          .values({
            sessionId: visit.id,
            storeId: store.id,
            rulesJson: JSON.stringify(rules),
            confirmedAt: visit.closedAt - 500,
            confirmedBy: owner.userId,
            idempotencyKey: seedId(`${visit.id}:confirm`),
            recipientsJson: JSON.stringify([participantId]),
            mutationId: seedId(`${visit.id}:points`),
          })
          .onConflictDoNothing(),
        db
          .insert(business.customerPointAllocations)
          .values({
            sessionId: visit.id,
            membershipId,
            storeId: store.id,
            position: 0,
            amount: visit.paid,
            points: rules.points,
          })
          .onConflictDoNothing(),
        db
          .insert(business.customerPointEntries)
          .values({
            id: seedId(`${visit.id}:award`),
            storeId: store.id,
            membershipId,
            delta: rules.points,
            kind: "award",
            reference: `visit:${visit.id}`,
            reason: "合成seedの確認済み来店",
            createdBy: owner.userId,
            createdAt: visit.closedAt - 500,
          })
          .onConflictDoNothing(),
      );
    }
    // 一会員を原子的に投入し、再実行では手動の変更や利用済みの状態を保持する。
    const [first, ...rest] = statements;
    if (first) await db.batch([first, ...rest]);
  }
  const image = store.configuration.branding?.banner;
  if (!image) throw new Error("クーポン券面の店舗画像がありません。");
  const startsAt = Date.UTC(2026, 9, 1);
  const endsAt = Date.UTC(2027, 2, 1);
  const common = {
    imageKey: image.imageKey,
    imageKind: image.imageKind,
    imageSource: image.imageSource,
    startsAt,
    endsAt,
    minimumYen: 3000,
    discountKind: "fixed",
    discountValue: 500,
    maximumYen: 500,
    conditions: { all: [], any: [] },
    presentation: { layout: "landscape", imageFit: "contain" },
  } as const;
  const definitions = [
    {
      key: "three-visits",
      rules: couponRuleSchema.parse({
        ...common,
        title: { ja: "来店3回ありがとう 500円引き", en: "Thank you for three visits: ¥500 off" },
        description: {
          ja: "確認済み来店3回以上の会員に1回発行。税込3,000円以上で500円引き。1会計1枚。",
          en: "Issued once after three verified visits. ¥500 off a bill of ¥3,000 or more, including tax. One voucher per bill.",
        },
        trigger: "visits",
        threshold: 3,
        conditions: { all: [{ field: "visits", operator: "gte", value: 3 }], any: [] },
      }),
    },
    {
      key: "loyal-spend",
      rules: couponRuleSchema.parse({
        ...common,
        title: { ja: "常連会員10%引き", en: "10% off for returning members" },
        description: {
          ja: "確認済み来店3回以上かつ購入額配分30,000円以上。税込5,000円以上で10%引き、上限800円。",
          en: "For members with three verified visits and ¥30,000 in allocated purchases. 10% off bills of ¥5,000 or more, capped at ¥800.",
        },
        minimumYen: 5000,
        discountKind: "percent",
        discountValue: 10,
        maximumYen: 800,
        trigger: "spend",
        threshold: 30000,
        conditions: { all: [{ field: "visits", operator: "gte", value: 3 }], any: [] },
      }),
    },
    {
      key: "point-exchange",
      rules: couponRuleSchema.parse({
        ...common,
        title: { ja: "50ポイントで500円引き", en: "Exchange 50 points for ¥500 off" },
        description: {
          ja: "50ポイントと交換。税込3,000円以上の会計で500円引き。1会計1枚。",
          en: "Exchange 50 points for ¥500 off a bill of ¥3,000 or more. One voucher per bill.",
        },
        trigger: "exchange",
        threshold: 50,
      }),
    },
    {
      key: "manual",
      rules: couponRuleSchema.parse({
        ...common,
        title: { ja: "会員限定500円引き", en: "Members-only ¥500 voucher" },
        description: {
          ja: "店舗スタッフから手動発行。税込3,000円以上で500円引き。1会計1枚。",
          en: "Issued by a member of staff. ¥500 off a bill of ¥3,000 or more. One voucher per bill.",
        },
        trigger: "manual",
        threshold: 1,
      }),
    },
  ];
  for (const definition of definitions) {
    const id = seedId(`${store.id}:rule:${definition.key}`);
    await db
      .insert(business.customerCouponRules)
      .values({
        id,
        storeId: store.id,
        version: 1,
        active: true,
        rulesJson: JSON.stringify(definition.rules),
        createdAt: startsAt,
        updatedAt: startsAt,
        createdBy: owner.userId,
      })
      .onConflictDoNothing();
    if (definition.key !== "three-visits" && definition.key !== "manual") continue;
    const index = definition.key === "three-visits" ? 3 : 1;
    const membershipId = seedId(`${store.id}:member:${index}`);
    const couponId = seedId(`${store.id}:coupon:${definition.key}`);
    await db.batch([
      db
        .insert(business.customerCoupons)
        .values({
          id: couponId,
          storeId: store.id,
          membershipId,
          ruleId: id,
          ruleVersion: 1,
          snapshotJson: JSON.stringify(definition.rules),
          state: "available",
          issuanceKey: definition.key === "three-visits" ? `rule:${id}:once` : `manual:${couponId}`,
          mutationId: couponId,
          createdAt: Date.UTC(2026, 9, 30),
        })
        .onConflictDoNothing(),
      db
        .insert(business.customerCouponEvents)
        .values({
          id: seedId(`${couponId}:issued`),
          storeId: store.id,
          couponId,
          kind: "issued",
          reason: "合成seedの会員特典",
          createdBy: owner.userId,
          createdAt: Date.UTC(2026, 9, 30),
        })
        .onConflictDoNothing(),
    ]);
  }
}
