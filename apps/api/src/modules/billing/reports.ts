import { and, desc, eq, gte, isNull, like, lt, or, sql, sum } from "drizzle-orm";
import type { ApiServices } from "../../platform/context";
import {
  billingOutbox,
  billingSync,
  organizationAiKeys,
  organizationCosts,
  responseUsage,
  voiceUsageSessions,
} from "../../db/billing-schema";
import { restaurantTables, tableSessions } from "../../db/table-schema";
import { ensure } from "../../platform/errors";

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
      .select({ firstKeyAt: sql<null | number>`min(${organizationAiKeys.createdAt})` })
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
