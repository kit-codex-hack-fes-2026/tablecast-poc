import { and, desc, eq, gt, gte, inArray, isNotNull, lt, lte, or, sql } from "drizzle-orm";
import type { ApiServices } from "../../platform/context";
import {
  billingOutbox,
  organizationAi,
  responseUsage,
  voiceUsageSessions,
} from "../../db/billing-schema";
import { member, organization, subscription } from "../../db/identity-schema";
import { stores } from "../../db/table-schema";
import { ensure } from "../../platform/errors";

export async function billingAccess(services: ApiServices, userId: string, organizationId: string) {
  const row = await services.db
    .select({ id: organization.id, name: organization.name, role: member.role, storeId: stores.id })
    .from(organization)
    .innerJoin(member, eq(member.organizationId, organization.id))
    .innerJoin(stores, eq(stores.organization_id, organization.id))
    .where(and(eq(organization.id, organizationId), eq(member.userId, userId)))
    .get();
  ensure(row, "ORGANIZATION_FORBIDDEN", 403);
  return { ...row, canManage: row.role === "owner" || row.role === "admin" };
}

export async function billingSummary(
  services: ApiServices,
  organizationId: string,
  start: number,
  end: number,
) {
  const scope = and(eq(voiceUsageSessions.organizationId, organizationId));
  const now = new Date();
  const currentCycle = services.db
    .select({ id: subscription.id, start: subscription.periodStart, end: subscription.periodEnd })
    .from(subscription)
    .where(
      and(
        eq(subscription.referenceId, organizationId),
        inArray(subscription.status, ["active", "past_due"]),
        isNotNull(subscription.stripeSubscriptionId),
        lte(subscription.periodStart, now),
        gt(subscription.periodEnd, now),
      ),
    )
    .orderBy(desc(subscription.periodEnd))
    .limit(1)
    .as("current_cycle");
  const day = sql<number>`unixepoch(${billingOutbox.createdAt} / 1000, 'unixepoch', 'start of day') * 1000`;
  const [responses, charges, account, subscriptions, days, cycleUsage] = await services.db.batch([
    services.db
      .select({
        count: sql<number>`count(*)`,
        inputTokens: sql<number>`coalesce(sum(${responseUsage.inputTokens}),0)`,
        cachedTokens: sql<number>`coalesce(sum(${responseUsage.cachedTokens}),0)`,
        outputTokens: sql<number>`coalesce(sum(${responseUsage.outputTokens}),0)`,
      })
      .from(responseUsage)
      .innerJoin(voiceUsageSessions, eq(voiceUsageSessions.id, responseUsage.voiceSessionId))
      .where(and(scope, gte(responseUsage.createdAt, start), lt(responseUsage.createdAt, end))),
    services.db
      .select({ pending: sql<number>`count(*)` })
      .from(voiceUsageSessions)
      .where(
        and(
          scope,
          or(eq(voiceUsageSessions.final, false), eq(voiceUsageSessions.measurementFailed, true)),
          gte(voiceUsageSessions.startedAt, start),
          lt(voiceUsageSessions.startedAt, end),
        ),
      ),
    services.db
      .select({ state: organizationAi.state })
      .from(organizationAi)
      .where(eq(organizationAi.organizationId, organizationId)),
    services.db
      .select()
      .from(subscription)
      .where(eq(subscription.referenceId, organizationId))
      .orderBy(desc(subscription.periodEnd))
      .limit(1),
    services.db
      .select({
        day,
        seconds: sql<number>`coalesce(sum(${billingOutbox.seconds}),0)`,
        chargeMicros: sql<number>`coalesce(sum(case when ${voiceUsageSessions.billable} then ${billingOutbox.chargeMicros} else 0 end),0)`,
      })
      .from(billingOutbox)
      .innerJoin(voiceUsageSessions, eq(voiceUsageSessions.id, billingOutbox.voiceSessionId))
      .where(and(scope, gte(billingOutbox.createdAt, start), lt(billingOutbox.createdAt, end)))
      .groupBy(day)
      .orderBy(day),
    services.db
      .select({
        start: currentCycle.start,
        end: currentCycle.end,
        chargeMicros: sql<number>`coalesce(sum(case when ${voiceUsageSessions.billable} then ${billingOutbox.chargeMicros} else 0 end),0)`,
        unconfirmed: sql<number>`count(distinct case when ${voiceUsageSessions.billable} and (not ${voiceUsageSessions.final} or ${voiceUsageSessions.measurementFailed}) then ${voiceUsageSessions.id} end)`,
      })
      .from(currentCycle)
      .leftJoin(
        billingOutbox,
        and(
          eq(billingOutbox.organizationId, organizationId),
          gte(billingOutbox.createdAt, currentCycle.start),
          lt(billingOutbox.createdAt, currentCycle.end),
        ),
      )
      .leftJoin(
        voiceUsageSessions,
        and(scope, eq(voiceUsageSessions.id, billingOutbox.voiceSessionId)),
      )
      .groupBy(currentCycle.id),
  ]);
  const total = days.reduce(
    (value, bucket) => ({
      seconds: value.seconds + bucket.seconds,
      chargeMicros: value.chargeMicros + bucket.chargeMicros,
    }),
    { seconds: 0, chargeMicros: 0 },
  );
  const daily = new Map(days.map((value) => [value.day, value]));
  const cycle = cycleUsage[0];
  return {
    seconds: total.seconds,
    chargeMicros: total.chargeMicros,
    responses: responses[0]?.count ?? 0,
    inputTokens: responses[0]?.inputTokens ?? 0,
    cachedTokens: responses[0]?.cachedTokens ?? 0,
    outputTokens: responses[0]?.outputTokens ?? 0,
    unconfirmed: charges[0]?.pending ?? 0,
    aiState: account[0]?.state ?? "pending",
    subscription: subscriptions[0] ?? null,
    daily: Array.from({ length: (end - start) / 86400000 }, (_, index) => {
      const date = start + index * 86400000;
      return daily.get(date) ?? { day: date, seconds: 0, chargeMicros: 0 };
    }),
    currentCycle:
      cycle?.start && cycle.end
        ? {
            start: cycle.start.getTime(),
            end: cycle.end.getTime(),
            chargeMicros: cycle.chargeMicros,
            unconfirmed: cycle.unconfirmed,
          }
        : null,
  };
}

export async function billingCustomer(services: ApiServices, organizationId: string) {
  const row = await services.db
    .select({ customer: organization.stripeCustomerId })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .get();
  return row?.customer;
}
