import { sql } from "drizzle-orm";
import { integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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

// 配備CLIが作成する運用テーブル。0=未着手、2=DB完了・画像待ち、1=全体完了。
export const deploymentOwner = sqliteTable("tablecast_deployment_owner", {
  repository: text("repository").notNull(),
  environment: text("environment").notNull(),
  seeded: integer("seeded").notNull().default(0),
});

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

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  store_id: text("store_id").notNull(),
  table_session_id: text("table_session_id").notNull(),
  idempotency_key: text("idempotency_key").notNull(),
  kind: text("kind", { enum: ["payment", "adjustment"] }).notNull(),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull(),
  actor_id: text("actor_id").notNull(),
  created_at: integer("created_at").notNull(),
});

export const configReleases = sqliteTable(
  "config_releases",
  {
    store_id: text("store_id").notNull(),
    version: integer("version").notNull(),
    config_json: text("config_json").notNull(),
    published_by: text("published_by").notNull(),
    created_at: integer("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.store_id, table.version] })],
);

// SQL migrationを正本とする業務テーブルのquery用定義。制約の作成・変更はmigrationで行う。
export const stores = sqliteTable("stores", {
  id: text("id").primaryKey().notNull(),
  organization_id: text("organization_id").notNull(),
  name: text("name").notNull(),
  config_version: integer("config_version").notNull().default(1),
  config_json: text("config_json").notNull(),
  updated_at: integer("updated_at").notNull(),
  team_id: text("team_id"),
});

export const tableSessions = sqliteTable("table_sessions", {
  id: text("id").primaryKey().notNull(),
  store_id: text("store_id").notNull(),
  table_id: text("table_id"),
  kind: text("kind", { enum: ["table", "demo"] })
    .notNull()
    .default("table"),
  locale: text("locale", { enum: ["ja", "en"] }).notNull(),
  status: text("status", { enum: ["open", "closed"] })
    .notNull()
    .default("open"),
  guest_count: integer("guest_count").notNull(),
  cart_version: integer("cart_version").notNull().default(0),
  cart_json: text("cart_json").notNull().default("[]"),
  mutation_id: text("mutation_id"),
  voice_state: text("voice_state", { enum: ["active", "stopped", "error"] })
    .notNull()
    .default("stopped"),
  voice_session_id: text("voice_session_id"),
  voice_version: integer("voice_version").notNull().default(0),
  active_turn_id: text("active_turn_id"),
  ui_section: text("ui_section", { enum: ["menu", "cart", "orders", "bill"] })
    .notNull()
    .default("menu"),
  selected_product_id: text("selected_product_id"),
  speech_speed: real("speech_speed").notNull().default(1),
  staff_called: integer("staff_called").notNull().default(0),
  plan_json: text("plan_json"),
  opened_at: integer("opened_at").notNull(),
  closed_at: integer("closed_at"),
  timeline_start_day: integer("timeline_start_day").generatedAlwaysAs(
    sql`((opened_at - ((opened_at + 32400000) % 86400000 + 86400000) % 86400000 + 32400000) / 86400000 + 2147483648)`,
  ),
  timeline_end_day: integer("timeline_end_day").generatedAlwaysAs(
    sql`((max(opened_at, closed_at - 1) - ((max(opened_at, closed_at - 1) + 32400000) % 86400000 + 86400000) % 86400000 + 32400000) / 86400000 + 2147483648)`,
  ),
  timeline_fork: integer("timeline_fork").generatedAlwaysAs(
    sql.raw(
      [
        "CASE WHEN closed_at IS NULL OR closed_at < opened_at THEN NULL",
        "WHEN timeline_start_day=timeline_end_day THEN 2*timeline_start_day",
        ...Array.from({ length: 32 }, (_, i) => {
          const bit = 31 - i;
          return `WHEN (timeline_start_day >> ${bit}) != (timeline_end_day >> ${bit}) THEN ((timeline_start_day >> ${bit + 1}) << ${bit + 2}) + ${2 ** (bit + 1)} - 1`;
        }),
        "END",
      ].join("\n"),
    ),
  ),
});

export const confirmations = sqliteTable("confirmations", {
  id: text("id").primaryKey().notNull(),
  store_id: text("store_id").notNull(),
  table_session_id: text("table_session_id").notNull(),
  cart_version: integer("cart_version").notNull(),
  config_version: integer("config_version").notNull(),
  channel: text("channel", { enum: ["gui", "voice"] }).notNull(),
  voice_session_id: text("voice_session_id"),
  created_turn_id: text("created_turn_id"),
  read_at: integer("read_at"),
  status: text("status", { enum: ["pending", "read", "invalid", "submitted"] }).notNull(),
  snapshot_json: text("snapshot_json").notNull(),
  expires_at: integer("expires_at").notNull(),
  created_at: integer("created_at").notNull(),
});

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey().notNull(),
  store_id: text("store_id").notNull(),
  table_session_id: text("table_session_id").notNull(),
  snapshot_id: text("snapshot_id").notNull(),
  idempotency_key: text("idempotency_key").notNull(),
  status: text("status", {
    enum: ["submitted", "accepted", "served", "cancelled", "rejected"],
  }).notNull(),
  snapshot_json: text("snapshot_json").notNull(),
  total: integer("total").notNull(),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
});

export const tableEvents = sqliteTable("table_events", {
  cursor: integer("cursor").primaryKey({ autoIncrement: true }).notNull(),
  store_id: text("store_id").notNull(),
  table_session_id: text("table_session_id"),
  kind: text("kind").notNull(),
  data_json: text("data_json").notNull(),
  created_at: integer("created_at").notNull(),
});

export const restaurantTables = sqliteTable("restaurant_tables", {
  id: text("id").primaryKey().notNull(),
  store_id: text("store_id").notNull(),
  name: text("name").notNull(),
});
export const devices = sqliteTable("devices", {
  id: text("id").primaryKey().notNull(),
  token_hash: text("token_hash").notNull(),
  store_id: text("store_id").notNull(),
  table_id: text("table_id").notNull(),
  approved_by: text("approved_by").notNull(),
  revoked_at: integer("revoked_at"),
  created_at: integer("created_at").notNull(),
});
export const voiceTurns = sqliteTable("voice_turns", {
  id: text("id").primaryKey().notNull(),
  voice_session_id: text("voice_session_id").notNull(),
  table_session_id: text("table_session_id").notNull(),
  store_id: text("store_id").notNull(),
  locale: text("locale", { enum: ["ja", "en"] })
    .notNull()
    .default("ja"),
  status: text("status", { enum: ["started", "completed", "interrupted", "failed"] }).notNull(),
  started_at: integer("started_at").notNull(),
  ended_at: integer("ended_at"),
  agent_session_id: text("agent_session_id"),
  agent_finished_at: integer("agent_finished_at"),
});

export const deviceAssignments = sqliteTable("device_assignments", {
  user_code: text("user_code").primaryKey().notNull(),
  store_id: text("store_id").notNull(),
  table_id: text("table_id").notNull(),
  approved_by: text("approved_by").notNull(),
  created_at: integer("created_at").notNull(),
});
export const configDrafts = sqliteTable("config_drafts", {
  id: text("id").primaryKey().notNull(),
  store_id: text("store_id").notNull(),
  base_version: integer("base_version").notNull(),
  version: integer("version").notNull().default(1),
  status: text("status", { enum: ["draft", "ready", "published", "discarded"] }).notNull(),
  config_json: text("config_json").notNull(),
  errors_json: text("errors_json").notNull().default("[]"),
  created_by: text("created_by").notNull(),
  publish_key: text("publish_key"),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
});

export const demoSessions = sqliteTable("demo_sessions", {
  session_id: text("session_id").primaryKey().notNull(),
  created_by: text("created_by").notNull(),
  source_draft_id: text("source_draft_id"),
  source_version: integer("source_version").notNull(),
  config_version: integer("config_version").notNull().default(1),
  config_json: text("config_json").notNull(),
});

export const gamePlugins = sqliteTable(
  "game_plugins",
  {
    store_id: text("store_id").notNull(),
    id: text("id").notNull(),
    active_version_id: text("active_version_id"),
    revision: integer("revision").notNull().default(0),
    mutation_id: text("mutation_id"),
  },
  (table) => [primaryKey({ columns: [table.store_id, table.id] })],
);

export const gameVersions = sqliteTable("game_versions", {
  id: text("id").primaryKey().notNull(),
  store_id: text("store_id").notNull(),
  game_id: text("game_id").notNull(),
  manifest_json: text("manifest_json").notNull(),
  package_key: text("package_key").notNull(),
  status: text("status", { enum: ["draft", "ready"] })
    .notNull()
    .default("draft"),
  previewed_by: text("previewed_by"),
  published_by: text("published_by"),
  created_at: integer("created_at").notNull(),
});

export const gameRuns = sqliteTable("game_runs", {
  id: text("id").primaryKey().notNull(),
  store_id: text("store_id").notNull(),
  table_session_id: text("table_session_id").notNull(),
  game_id: text("game_id").notNull(),
  version_id: text("version_id").notNull(),
  state_json: text("state_json").notNull().default("{}"),
  revision: integer("revision").notNull().default(0),
  ended_at: integer("ended_at"),
});

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
