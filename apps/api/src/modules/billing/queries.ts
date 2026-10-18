import {
  and,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  like,
  lte,
  or,
  sql,
  sum,
} from "drizzle-orm";
import { member, organization, subscription } from "../../db/auth-schema";
import {
  billingOutbox,
  billingSync,
  organizationCosts,
  organizationAiKeys,
  organizationAi,
  responseUsage,
  restaurantTables,
  stores,
  tableSessions,
  voiceUsageSessions,
} from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
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

export async function billingVisits(
  services: ApiServices,
  organizationId: string,
  start: number,
  end: number,
  before?: string,
  search?: string,
) {
  const cursor = before?.split("|");
  ensure(
    !cursor ||
      (cursor.length === 2 && Number.isSafeInteger(Number(cursor[0])) && Boolean(cursor[1])),
    "INVALID_INPUT",
    422,
  );
  const usage = services.db
    .select({
      id: billingOutbox.voiceSessionId,
      seconds: sum(billingOutbox.seconds).as("usage_seconds"),
      chargeMicros:
        sql<string>`sum(case when ${voiceUsageSessions.billable} then ${billingOutbox.chargeMicros} else 0 end)`.as(
          "usage_charge_micros",
        ),
    })
    .from(billingOutbox)
    .innerJoin(voiceUsageSessions, eq(voiceUsageSessions.id, billingOutbox.voiceSessionId))
    .where(
      and(
        eq(billingOutbox.organizationId, organizationId),
        gte(billingOutbox.createdAt, start),
        lt(billingOutbox.createdAt, end),
      ),
    )
    .groupBy(billingOutbox.voiceSessionId)
    .as("usage");
  const responses = services.db
    .select({
      id: responseUsage.voiceSessionId,
      count: sql<number>`count(*)`.as("response_count"),
      inputTokens: sum(responseUsage.inputTokens).as("response_input"),
      outputTokens: sum(responseUsage.outputTokens).as("response_output"),
    })
    .from(responseUsage)
    .innerJoin(voiceUsageSessions, eq(voiceUsageSessions.id, responseUsage.voiceSessionId))
    .where(
      and(
        eq(voiceUsageSessions.organizationId, organizationId),
        gte(responseUsage.createdAt, start),
        lt(responseUsage.createdAt, end),
      ),
    )
    .groupBy(responseUsage.voiceSessionId)
    .as("responses");
  return services.db
    .select({
      id: voiceUsageSessions.id,
      sessionId: tableSessions.id,
      storeId: voiceUsageSessions.storeId,
      tableName: restaurantTables.name,
      startedAt: voiceUsageSessions.startedAt,
      demo: voiceUsageSessions.demo,
      responses: sql<number>`coalesce(${responses.count},0)`,
      inputTokens: sql<number>`coalesce(${responses.inputTokens},0)`,
      outputTokens: sql<number>`coalesce(${responses.outputTokens},0)`,
      seconds: sql<number>`coalesce(${usage.seconds},0)`,
      chargeMicros: sql<number>`coalesce(${usage.chargeMicros},0)`,
      final: voiceUsageSessions.final,
    })
    .from(voiceUsageSessions)
    .innerJoin(usage, eq(usage.id, voiceUsageSessions.id))
    .leftJoin(responses, eq(responses.id, voiceUsageSessions.id))
    .innerJoin(tableSessions, eq(tableSessions.id, voiceUsageSessions.tableSessionId))
    .leftJoin(restaurantTables, eq(restaurantTables.id, tableSessions.table_id))
    .where(
      and(
        eq(voiceUsageSessions.organizationId, organizationId),

        cursor
          ? or(
              lt(voiceUsageSessions.startedAt, Number(cursor[0])),
              and(
                eq(voiceUsageSessions.startedAt, Number(cursor[0])),
                lt(voiceUsageSessions.id, cursor[1] ?? ""),
              ),
            )
          : undefined,
        search
          ? or(like(restaurantTables.name, `%${search}%`), like(tableSessions.id, `%${search}%`))
          : undefined,
      ),
    )
    .orderBy(desc(voiceUsageSessions.startedAt), desc(voiceUsageSessions.id))
    .limit(21);
}

export async function billingCustomer(services: ApiServices, organizationId: string) {
  const row = await services.db
    .select({ customer: organization.stripeCustomerId })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .get();
  return row?.customer;
}

export async function organizationCostReport(
  services: ApiServices,
  organizationId: string,
  month: string,
  start: number,
  end: number,
) {
  const [sync, keys, costs, unmatched, failed] = await services.db.batch([
    services.db
      .select()
      .from(billingSync)
      .where(eq(billingSync.id, `costs:${month}`)),
    services.db
      .select({ firstKeyAt: sql<number | null>`min(${organizationAiKeys.createdAt})` })
      .from(organizationAiKeys)
      .where(eq(organizationAiKeys.organizationId, organizationId)),
    services.db
      .select({ amount: organizationCosts.amountUsd })
      .from(organizationCosts)
      .innerJoin(
        billingSync,
        and(
          eq(billingSync.id, `costs:${month}`),
          eq(billingSync.completedAt, organizationCosts.fetchedAt),
        ),
      )
      .where(
        and(
          eq(organizationCosts.organizationId, organizationId),
          gte(organizationCosts.day, start),
          lt(organizationCosts.day, end),
        ),
      ),
    services.db
      .select({ amount: organizationCosts.amountUsd })
      .from(organizationCosts)
      .innerJoin(
        billingSync,
        and(
          eq(billingSync.id, `costs:${month}`),
          eq(billingSync.completedAt, organizationCosts.fetchedAt),
        ),
      )
      .where(
        and(
          isNull(organizationCosts.organizationId),
          gte(organizationCosts.day, start),
          lt(organizationCosts.day, end),
        ),
      ),
    services.db
      .select({ failedAt: billingSync.failedAt })
      .from(billingSync)
      .where(eq(billingSync.id, "openai-costs")),
  ]);
  const fetchedAt = sync[0]?.completedAt ?? null,
    firstKeyAt = keys[0]?.firstKeyAt ?? null;
  return {
    period: { start, end },
    fetchedAt,
    lastFailureAt: failed[0]?.failedAt ?? null,
    coverageStart: firstKeyAt === null ? null : Math.max(firstKeyAt, start),
    coverageEnd: fetchedAt === null ? null : Math.min(fetchedAt, end),
    amountUsd:
      fetchedAt === null || firstKeyAt === null || firstKeyAt >= Math.min(end, fetchedAt)
        ? null
        : costs.reduce((total, row) => total + Number(row.amount), 0),
    unattributedProjectUsd:
      fetchedAt === null ? null : unmatched.reduce((total, row) => total + Number(row.amount), 0),
    partial: firstKeyAt === null || firstKeyAt > start || unmatched.length > 0,
    stale: fetchedAt === null || Date.now() - fetchedAt > 2 * 86400000,
  };
}
