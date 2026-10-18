import { and, eq, exists, gte, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { organization, subscription } from "../../db/auth-schema";
import {
  billingOutbox,
  billingSync,
  organizationAi,
  organizationAiKeys,
  organizationCosts,
  voiceUsageSessions,
} from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import {
  adminOpenAI,
  organizationAiProvisioningEnabled,
  provisionOrganizationKey,
} from "./credentials";
import { billingEnabled, stripeClient } from "./stripe";
import { billingRatesSchema } from "./model";
import { utcMonthRange } from "./pricing";

const costsResponse = z.object({
  has_more: z.boolean(),
  next_page: z.string().nullish(),
  data: z.array(
    z.object({
      start_time: z.number(),
      results: z.array(
        z.object({
          api_key_id: z.string().nullable(),
          line_item: z.string().nullable(),
          amount: z.object({ currency: z.literal("usd"), value: z.number().finite() }),
        }),
      ),
    }),
  ),
});

export async function syncOrganizationCosts(services: ApiServices, now = Date.now()) {
  const { env, db } = services;
  if (!organizationAiProvisioningEnabled(env)) return;
  const lease = crypto.randomUUID();
  await db.insert(billingSync).values({ id: "openai-costs" }).onConflictDoNothing();
  const lock = await db
    .update(billingSync)
    .set({ lease, leaseUntil: Date.now() + 120000 })
    .where(
      and(
        eq(billingSync.id, "openai-costs"),
        lt(billingSync.leaseUntil, Date.now()),
        or(isNull(billingSync.completedAt), lt(billingSync.completedAt, now - 86400000)),
      ),
    )
    .returning()
    .get();
  if (!lock) return;
  const month = new Date(now);
  month.setUTCDate(1);
  month.setUTCHours(0, 0, 0, 0);
  month.setUTCMonth(month.getUTCMonth() - 1);
  const keys = await db
    .select({
      id: organizationAiKeys.id,
      organizationId: organizationAiKeys.organizationId,
      projectId: organizationAiKeys.projectId,
    })
    .from(organizationAiKeys);
  const organizationByKey = new Map(keys.map((key) => [key.id, key.organizationId]));
  const inserts: (typeof organizationCosts.$inferInsert)[] = [];
  const signal = AbortSignal.timeout(60000);
  let page: string | undefined;
  try {
    const seen = new Set<string>();
    do {
      const result = costsResponse.parse(
        await adminOpenAI(env).admin.organization.usage.costs(
          {
            start_time: Math.floor(month.getTime() / 1000),
            end_time: Math.floor(now / 1000),
            bucket_width: "1d",
            limit: 180,
            project_ids: [
              ...new Set([env.TABLECAST_OPENAI_PROJECT_ID, ...keys.map((key) => key.projectId)]),
            ],
            group_by: ["api_key_id", "line_item"],
            ...(page ? { page } : {}),
          },
          { signal },
        ),
      );
      for (const bucket of result.data)
        for (const value of bucket.results)
          inserts.push({
            id: `${now}:${bucket.start_time}:${value.api_key_id ?? "unknown"}:${value.line_item ?? "unknown"}`,
            organizationId: value.api_key_id
              ? (organizationByKey.get(value.api_key_id) ?? null)
              : null,
            apiKeyId: value.api_key_id,
            day: bucket.start_time * 1000,
            lineItem: value.line_item ?? "unknown",
            amountUsd: String(value.amount.value),
            fetchedAt: now,
          });
      page = result.has_more ? (result.next_page ?? undefined) : undefined;
      if (result.has_more && (!page || seen.has(page))) throw new Error("COSTS_PAGINATION_INVALID");
      if (page) seen.add(page);
    } while (page);
    // snapshotを先に保存し、二つの月の完了ポインターを同じbatchで公開する。
    for (let index = 0; index < inserts.length; index += 10) {
      await db
        .insert(organizationCosts)
        .values(inserts.slice(index, index + 10))
        .onConflictDoNothing();
    }
    const previousMonth = month.toISOString().slice(0, 7),
      currentMonth = new Date(now).toISOString().slice(0, 7);
    const publish = (value: string) =>
      db
        .insert(billingSync)
        .select(
          db
            .select({
              id: sql<string>`${`costs:${value}`}`.as("id"),
              completedAt: sql<number>`${now}`.as("completed_at"),
              failedAt: sql<number | null>`NULL`.as("failed_at"),
              lease: sql<string | null>`NULL`.as("lease"),
              leaseUntil: sql<number>`0`.as("lease_until"),
            })
            .from(billingSync)
            .where(and(eq(billingSync.id, "openai-costs"), eq(billingSync.lease, lease))),
        )
        .onConflictDoUpdate({ target: billingSync.id, set: { completedAt: now, failedAt: null } });
    await db.batch([
      publish(previousMonth),
      publish(currentMonth),
      db.delete(organizationCosts).where(
        and(
          gte(organizationCosts.day, month.getTime()),
          lt(organizationCosts.day, utcMonthRange(currentMonth).end),
          ne(organizationCosts.fetchedAt, now),
          exists(
            db
              .select({ id: billingSync.id })
              .from(billingSync)
              .where(and(eq(billingSync.id, "openai-costs"), eq(billingSync.lease, lease))),
          ),
        ),
      ),
      db
        .update(billingSync)
        .set({ completedAt: now, failedAt: null, lease: null, leaseUntil: 0 })
        .where(and(eq(billingSync.id, "openai-costs"), eq(billingSync.lease, lease))),
    ]);
  } catch {
    await db
      .update(billingSync)
      .set({ failedAt: now, lease: null, leaseUntil: 0 })
      .where(and(eq(billingSync.id, "openai-costs"), eq(billingSync.lease, lease)));
    throw new Error("OPENAI_COSTS_SYNC_FAILED");
  }
}

export async function sendBillingUsage(services: ApiServices, now = Date.now()) {
  const { db, env } = services;
  if (!billingEnabled(env)) return;
  const contracts = db
    .select({
      organizationId: subscription.referenceId,
      count: sql<number>`count(*)`.as("contract_count"),
      start: sql<number | null>`min(${subscription.periodStart})`.as("contract_start"),
      end: sql<number | null>`max(${subscription.periodEnd})`.as("contract_end"),
    })
    .from(subscription)
    .where(inArray(subscription.status, ["active", "past_due"]))
    .groupBy(subscription.referenceId)
    .as("contracts");
  const pending = await db
    .select({
      contractCount: contracts.count,
      periodStart: contracts.start,
      periodEnd: contracts.end,
      event: billingOutbox,
      ratesJson: voiceUsageSessions.ratesJson,
      voiceStartedAt: voiceUsageSessions.startedAt,
      customerId: organization.stripeCustomerId,
    })
    .from(billingOutbox)
    .innerJoin(voiceUsageSessions, eq(voiceUsageSessions.id, billingOutbox.voiceSessionId))
    .innerJoin(organization, eq(organization.id, billingOutbox.organizationId))
    .leftJoin(contracts, eq(contracts.organizationId, organization.id))
    .where(and(eq(billingOutbox.state, "pending"), isNull(billingOutbox.sentAt)))
    .orderBy(billingOutbox.createdAt, billingOutbox.id)
    .limit(100);
  const stripe = stripeClient(env);
  for (const {
    event,
    customerId,
    ratesJson,
    contractCount,
    periodStart,
    periodEnd,
    voiceStartedAt,
  } of pending) {
    // 35日を過ぎたイベントと送信結果不明の古いイベントは、自動再送せず照合対象に残す。
    if (
      !customerId ||
      contractCount !== 1 ||
      periodStart === null ||
      periodEnd === null ||
      voiceStartedAt < periodStart ||
      voiceStartedAt >= periodEnd ||
      event.createdAt < periodStart ||
      event.createdAt >= periodEnd ||
      now >= periodEnd ||
      now - event.createdAt >= 34 * 86400000 ||
      (event.firstAttemptAt && now - event.firstAttemptAt >= 23 * 3600000)
    ) {
      await db.update(billingOutbox).set({ state: "review" }).where(eq(billingOutbox.id, event.id));
      continue;
    }
    const rates = billingRatesSchema.parse(JSON.parse(ratesJson));
    const firstAttemptAt = event.firstAttemptAt ?? now;
    await db
      .update(billingOutbox)
      .set({ firstAttemptAt })
      .where(and(eq(billingOutbox.id, event.id), isNull(billingOutbox.firstAttemptAt)));
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(event.id));
    const identifier = `tablecast-${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    try {
      await stripe.billing.meterEvents.create(
        {
          event_name: rates.eventName,
          identifier,
          timestamp: Math.floor(event.createdAt / 1000),
          payload: { stripe_customer_id: customerId, value: String(event.chargeMicros) },
        },
        { idempotencyKey: identifier },
      );
      await db
        .update(billingOutbox)
        .set({ sentAt: now, state: "sent" })
        .where(and(eq(billingOutbox.id, event.id), eq(billingOutbox.state, "pending")));
    } catch {
      console.error("TableCast meter delivery failed");
    }
  }
}

export async function runBillingMaintenance(services: ApiServices, now = Date.now()) {
  if (organizationAiProvisioningEnabled(services.env)) {
    const pending = await services.db
      .select({ id: organizationAi.organizationId })
      .from(organizationAi)
      .where(
        or(
          inArray(organizationAi.state, ["pending", "failed"]),
          and(eq(organizationAi.state, "provisioning"), lte(organizationAi.leaseUntil, Date.now())),
        ),
      )
      .orderBy(organizationAi.updatedAt, organizationAi.organizationId)
      .limit(10);
    for (const row of pending) await provisionOrganizationKey(services, row.id);
    await syncOrganizationCosts(services, now).catch(() =>
      console.error("TableCast organization cost synchronization failed"),
    );
  }
  await sendBillingUsage(services, now);
}
