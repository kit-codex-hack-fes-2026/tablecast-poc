import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// 配備CLIが作成する運用テーブル。0=未着手、2=DB完了・画像待ち、1=全体完了。
export const deploymentOwner = sqliteTable("tablecast_deployment_owner", {
  repository: text("repository").notNull(),
  environment: text("environment").notNull(),
  seeded: integer("seeded").notNull().default(0),
});

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
  table_id: text("table_id").notNull(),
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
});
