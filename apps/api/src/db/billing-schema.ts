import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organization } from "./identity-schema";

// 課金の計測値とcredentialは顧客向けDTOへ直接展開しない。
export const organizationAi = sqliteTable("organization_ai", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id),
  state: text("state").notNull().default("pending"),
  serviceAccountId: text("service_account_id"),
  credentialId: text("credential_id"),
  lease: text("lease"),
  leaseUntil: integer("lease_until").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});

export const organizationAiKeys = sqliteTable(
  "organization_ai_keys",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    serviceAccountId: text("service_account_id").notNull(),
    encryptedKey: text("encrypted_key").notNull(),
    createdAt: integer("created_at").notNull(),
    revokedAt: integer("revoked_at"),
  },
  (t) => [index("organization_ai_keys_org").on(t.organizationId, t.createdAt)],
);

export const voiceUsageSessions = sqliteTable(
  "voice_usage_sessions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    storeId: text("store_id").notNull(),
    tableSessionId: text("table_session_id").notNull(),
    credentialId: text("credential_id"),
    startedAt: integer("started_at").notNull(),
    seconds: real("seconds").notNull().default(0),
    chargeMicros: integer("charge_micros").notNull().default(0),
    final: integer("final", { mode: "boolean" }).notNull().default(false),
    started: integer("started", { mode: "boolean" }).notNull().default(false),
    billable: integer("billable", { mode: "boolean" }).notNull().default(false),
    measurementFailed: integer("measurement_failed", { mode: "boolean" }).notNull().default(false),
    pricingVersion: text("pricing_version").notNull(),
    ratesJson: text("rates_json").notNull(),
    demo: integer("demo", { mode: "boolean" }).notNull().default(false),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("voice_usage_org_period").on(t.organizationId, t.startedAt, t.id)],
);

export const responseUsage = sqliteTable(
  "response_usage",
  {
    id: text("id").primaryKey(),
    voiceSessionId: text("voice_session_id")
      .notNull()
      .references(() => voiceUsageSessions.id),
    model: text("model").notNull(),
    serviceTier: text("service_tier").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    cachedTokens: integer("cached_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    chargeMicros: integer("charge_micros").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("response_usage_session").on(t.voiceSessionId)],
);

export const billingOutbox = sqliteTable(
  "billing_outbox",
  {
    voiceSessionId: text("voice_session_id")
      .notNull()
      .references(() => voiceUsageSessions.id),
    seconds: real("seconds").notNull().default(0),
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    chargeMicros: integer("charge_micros").notNull(),
    createdAt: integer("created_at").notNull(),
    firstAttemptAt: integer("first_attempt_at"),
    sentAt: integer("sent_at"),
    state: text("state").notNull().default("pending"),
  },
  (t) => [
    index("billing_outbox_pending").on(t.state, t.createdAt, t.id),
    index("billing_outbox_org_period").on(t.organizationId, t.createdAt),
    index("billing_outbox_session").on(t.voiceSessionId, t.createdAt),
  ],
);

export const organizationCosts = sqliteTable(
  "organization_costs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id"),
    apiKeyId: text("api_key_id"),
    day: integer("day").notNull(),
    lineItem: text("line_item").notNull(),
    amountUsd: text("amount_usd").notNull(),
    fetchedAt: integer("fetched_at").notNull(),
  },
  (t) => [index("organization_costs_org_day").on(t.organizationId, t.day)],
);

export const billingSync = sqliteTable("billing_sync", {
  id: text("id").primaryKey(),
  completedAt: integer("completed_at"),
  failedAt: integer("failed_at"),
  lease: text("lease"),
  leaseUntil: integer("lease_until").notNull().default(0),
});

export const billingRateVersions = sqliteTable("billing_rate_versions", {
  version: text("version").primaryKey(),
  ratesJson: text("rates_json").notNull(),
});
