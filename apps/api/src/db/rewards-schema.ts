import { integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const customerPointPolicies = sqliteTable(
  "customer_point_policies",
  {
    storeId: text("store_id").notNull(),
    version: integer("version").notNull(),
    rulesJson: text("rules_json").notNull(),
    createdAt: integer("created_at").notNull(),
    createdBy: text("created_by").notNull(),
  },
  (t) => [primaryKey({ columns: [t.storeId, t.version] })],
);

export const customerPointVisits = sqliteTable("customer_point_visits", {
  sessionId: text("session_id").primaryKey(),
  storeId: text("store_id").notNull(),
  rulesJson: text("rules_json").notNull(),
  confirmedAt: integer("confirmed_at"),
  confirmedBy: text("confirmed_by"),
  idempotencyKey: text("idempotency_key"),
  recipientsJson: text("recipients_json").notNull().default("[]"),
  mutationId: text("mutation_id"),
});

export const customerPointAllocations = sqliteTable(
  "customer_point_allocations",
  {
    sessionId: text("session_id").notNull(),
    membershipId: text("membership_id").notNull(),
    storeId: text("store_id").notNull(),
    position: integer("position").notNull(),
    amount: integer("amount").notNull(),
    points: integer("points").notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.membershipId] })],
);

export const customerPointEntries = sqliteTable(
  "customer_point_entries",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id").notNull(),
    membershipId: text("membership_id").notNull(),
    delta: integer("delta").notNull(),
    kind: text("kind", { enum: ["award", "exchange", "correction"] }).notNull(),
    reference: text("reference").notNull(),
    reason: text("reason").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("customer_point_entries_reference").on(t.storeId, t.membershipId, t.reference),
  ],
);

export const customerCouponRules = sqliteTable("customer_coupon_rules", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull(),
  version: integer("version").notNull(),
  active: integer("active", { mode: "boolean" }).notNull(),
  rulesJson: text("rules_json").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  createdBy: text("created_by").notNull(),
});

export const customerCoupons = sqliteTable(
  "customer_coupons",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id").notNull(),
    membershipId: text("membership_id").notNull(),
    ruleId: text("rule_id").notNull(),
    ruleVersion: integer("rule_version").notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    state: text("state", { enum: ["available", "requested", "used", "revoked"] }).notNull(),
    requestedSessionId: text("requested_session_id"),
    issuanceKey: text("issuance_key").notNull(),
    mutationId: text("mutation_id").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("customer_coupons_issue_key").on(t.membershipId, t.issuanceKey)],
);

export const customerCouponUses = sqliteTable("customer_coupon_uses", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull(),
  couponId: text("coupon_id").notNull(),
  sessionId: text("session_id").notNull(),
  discount: integer("discount").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at").notNull(),
  cancelledAt: integer("cancelled_at"),
  cancelKey: text("cancel_key"),
  cancelReason: text("cancel_reason"),
});

export const customerCouponEvents = sqliteTable("customer_coupon_events", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull(),
  couponId: text("coupon_id").notNull(),
  kind: text("kind").notNull(),
  reason: text("reason").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at").notNull(),
});
