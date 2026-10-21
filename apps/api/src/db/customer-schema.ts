import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const customerMemberships = sqliteTable(
  "customer_memberships",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id").notNull(),
    userId: text("user_id").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    shareCompanions: integer("share_companions", { mode: "boolean" }).notNull(),
    useMemories: integer("use_memories", { mode: "boolean" }).notNull(),
    saveMemories: integer("save_memories", { mode: "boolean" }).notNull(),
    consentVersion: integer("consent_version").notNull(),
    revision: integer("revision").notNull().default(1),
    joinedAt: integer("joined_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [uniqueIndex("customer_memberships_store_user").on(table.storeId, table.userId)],
);

export const customerVisitCodes = sqliteTable("customer_visit_codes", {
  deviceId: text("device_id").primaryKey(),
  storeId: text("store_id").notNull(),
  sessionId: text("session_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const customerVisitParticipants = sqliteTable(
  "customer_visit_participants",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id").notNull(),
    sessionId: text("session_id").notNull(),
    membershipId: text("membership_id").notNull(),
    joinedAt: integer("joined_at").notNull(),
    leftAt: integer("left_at"),
  },
  (table) => [
    uniqueIndex("customer_visit_participants_session_member").on(
      table.sessionId,
      table.membershipId,
    ),
  ],
);

export const customerContexts = sqliteTable("customer_contexts", {
  sessionId: text("session_id").primaryKey(),
  storeId: text("store_id").notNull(),
  token: text("token").notNull(),
  selectedParticipantId: text("selected_participant_id"),
  previousVoiceSessionId: text("previous_voice_session_id"),
});

export const customerMemorySources = sqliteTable("customer_memory_sources", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull(),
  membershipId: text("membership_id").notNull(),
  sessionId: text("session_id").notNull(),
  voiceSessionId: text("voice_session_id").notNull(),
  turnId: text("turn_id").notNull(),
  contextToken: text("context_token").notNull(),
  consentRevision: integer("consent_revision").notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const customerMemories = sqliteTable(
  "customer_memories",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id").notNull(),
    membershipId: text("membership_id").notNull(),
    sourceId: text("source_id"),
    sourceKind: text("source_kind", { enum: ["manual", "voice"] }).notNull(),
    content: text("content").notNull(),
    revision: integer("revision").notNull().default(1),
    edited: integer("edited", { mode: "boolean" }).notNull().default(false),
    deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [uniqueIndex("customer_memories_source").on(t.membershipId, t.sourceId)],
);

export const customerConsumption = sqliteTable(
  "customer_consumption",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id").notNull(),
    membershipId: text("membership_id").notNull(),
    sessionId: text("session_id").notNull(),
    orderId: text("order_id").notNull(),
    lineId: text("line_id").notNull(),
    productId: text("product_id").notNull(),
    quantity: integer("quantity").notNull(),
    shared: integer("shared", { mode: "boolean" }).notNull(),
    revision: integer("revision").notNull().default(1),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [uniqueIndex("customer_consumption_line").on(t.membershipId, t.orderId, t.lineId)],
);
