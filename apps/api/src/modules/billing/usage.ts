import { and, desc, eq, gt, lte, sql } from "drizzle-orm";
import { billingOutbox, responseUsage, voiceUsageSessions, stores } from "../../db/business-schema";
import { subscription } from "../../db/auth-schema";
import { billingEnabled, frozenBillingRates } from "./stripe";
import { organizationAiEnabled, organizationCredential, sessionCredential } from "./credentials";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import { billingEventSchema, billingRatesSchema } from "./model";
import { billingPricingVersion, usageCharge } from "./pricing";

export async function voiceBillingAccount(services: ApiServices, storeId: string) {
  if (!organizationAiEnabled(services.env)) {
    ensure(!billingEnabled(services.env), "ORGANIZATION_AI_REQUIRED", 503);
    return {
      apiKey: await sessionCredential(services, null),
      credentialId: null,
      organizationId: null,
      rates: null,
      billable: false,
    };
  }
  const store = await services.db
    .select({ organizationId: stores.organization_id })
    .from(stores)
    .where(eq(stores.id, storeId))
    .get();
  ensure(store, "STORE_NOT_FOUND", 404);
  // キーの準備と利用権は独立して検査する。未契約でもキー自体は作成済みになる。
  const credential = await organizationCredential(services, store.organizationId);
  const contract = billingEnabled(services.env)
    ? await services.db
        .select()
        .from(subscription)
        .where(
          and(
            eq(subscription.referenceId, store.organizationId),
            eq(subscription.status, "active"),
            lte(subscription.periodStart, new Date()),
            gt(subscription.periodEnd, new Date()),
          ),
        )
        .orderBy(desc(subscription.periodEnd))
        .get()
    : null;
  ensure(!billingEnabled(services.env) || contract, "SUBSCRIPTION_REQUIRED", 403);
  const rates = await frozenBillingRates(services.env, services.db, contract?.plan);
  return {
    apiKey: credential.apiKey,
    credentialId: credential.id,
    organizationId: store.organizationId,
    rates,
    billable: billingEnabled(services.env),
  };
}

export async function beginVoiceUsage(
  services: ApiServices,
  sessionId: string,
  storeId: string,
  tableSessionId: string,
  demo: boolean,
  account: Awaited<ReturnType<typeof voiceBillingAccount>>,
) {
  if (!account.rates || !account.organizationId) return;
  const now = Date.now(),
    chargeMicros = usageCharge({ seconds: 15 }, account.rates.markupBps);
  await services.db.batch([
    services.db.insert(voiceUsageSessions).values({
      id: sessionId,
      storeId,
      tableSessionId,
      organizationId: account.organizationId,
      credentialId: account.credentialId,
      startedAt: now,
      chargeMicros,
      pricingVersion: billingPricingVersion,
      ratesJson: JSON.stringify(account.rates),
      demo,
      billable: account.billable,
      updatedAt: now,
    }),
    services.db.insert(billingOutbox).values({
      id: `initial:${sessionId}`,
      organizationId: account.organizationId,
      voiceSessionId: sessionId,
      seconds: 0,
      chargeMicros,
      createdAt: now,
      state: account.billable ? "pending" : "unbilled",
    }),
  ]);
}

export async function recordVoiceUsage(services: ApiServices, sessionId: string, raw: unknown) {
  const parsed = billingEventSchema.safeParse(raw);
  ensure(parsed.success, "VOICE_USAGE_INVALID", 503);
  const event = parsed.data;
  const row = await services.db
    .select()
    .from(voiceUsageSessions)
    .where(eq(voiceUsageSessions.id, sessionId))
    .get();
  ensure(row, "VOICE_USAGE_NOT_FOUND", 404);
  ensure(row.pricingVersion === billingPricingVersion, "BILLING_VERSION_UNAVAILABLE", 503);
  const db = services.db,
    rates = billingRatesSchema.parse(JSON.parse(row.ratesJson));
  const now = Date.now();
  const outbox = (id: string, chargeMicros: number, seconds = 0) =>
    db
      .insert(billingOutbox)
      .select(
        db
          .select({
            voiceSessionId: sql<string>`${sessionId}`.as("voice_session_id"),
            seconds: sql<number>`${seconds}`.as("seconds"),
            id: sql<string>`${id}`.as("id"),
            organizationId: sql<string>`${row.organizationId}`.as("organization_id"),
            chargeMicros: sql<number>`${chargeMicros}`.as("charge_micros"),
            createdAt: sql<number>`${now}`.as("created_at"),
            firstAttemptAt: sql<number | null>`NULL`.as("first_attempt_at"),
            sentAt: sql<number | null>`NULL`.as("sent_at"),
            state: sql<string>`${row.billable ? "pending" : "unbilled"}`.as("state"),
          })
          .from(voiceUsageSessions)
          .where(and(eq(voiceUsageSessions.id, sessionId), sql`changes()=1`)),
      )
      .onConflictDoNothing();
  if (event.type === "session.started") {
    await db
      .update(voiceUsageSessions)
      .set({ started: true, updatedAt: now })
      .where(eq(voiceUsageSessions.id, sessionId));
  } else if (
    (event.type === "session.usage.updated" || event.type === "session.closed") &&
    event.usage
  ) {
    const seconds = event.usage.seconds;
    if (seconds < row.seconds || row.final) return;
    const chargeMicros = usageCharge(
      { seconds: !row.started && seconds === 0 ? 15 : seconds },
      rates.markupBps,
    );
    // 累積の比較と更新を同じ条件で行い、逆順・並行受信でも差分を重複させない。
    const result = await db.batch([
      db
        .update(voiceUsageSessions)
        .set({
          seconds,
          chargeMicros,
          final: event.type === "session.closed",
          started: row.started || seconds > 0,
          updatedAt: now,
        })
        .where(
          and(
            eq(voiceUsageSessions.id, sessionId),
            eq(voiceUsageSessions.seconds, row.seconds),
            eq(voiceUsageSessions.chargeMicros, row.chargeMicros),
            eq(voiceUsageSessions.started, row.started),
            eq(voiceUsageSessions.final, false),
            sql`${seconds}>=${row.seconds}`,
          ),
        ),
      outbox(
        `voice:${sessionId}:${seconds}:${chargeMicros}`,
        chargeMicros - row.chargeMicros,
        seconds - row.seconds,
      ),
    ]);
    if (!result[0].meta.changes) await recordVoiceUsage(services, sessionId, raw);
  } else if (event.type === "response.event" && event.event?.response?.usage) {
    const response = event.event.response;
    if (
      !["response.completed", "response.incomplete", "response.failed"].includes(event.event.type)
    )
      return;
    const usage = response.usage;
    if (!usage) return;
    const cachedTokens = usage.input_tokens_details?.cached_tokens ?? 0;
    const chargeMicros = usageCharge(
      {
        model: response.model,
        serviceTier: response.service_tier,
        inputTokens: usage.input_tokens,
        cachedTokens,
        outputTokens: usage.output_tokens,
      },
      rates.markupBps,
    );
    await db.batch([
      db
        .insert(responseUsage)
        .values({
          id: response.id,
          voiceSessionId: sessionId,
          model: response.model,
          serviceTier: response.service_tier ?? "default",
          inputTokens: usage.input_tokens,
          cachedTokens,
          outputTokens: usage.output_tokens,
          chargeMicros,
          createdAt: now,
        })
        .onConflictDoNothing(),
      outbox(`response:${response.id}`, chargeMicros),
    ]);
  }
}
