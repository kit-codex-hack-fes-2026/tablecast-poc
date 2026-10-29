import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const posConnections = sqliteTable("pos_connections", {
  id: text("id").primaryKey().notNull(),
  storeId: text("store_id").notNull(),
  provider: text("provider", { enum: ["square"] }).notNull(),
  mode: text("mode", { enum: ["live", "test"] })
    .notNull()
    .default("live"),
  status: text("status", {
    enum: ["connected", "reauthorize", "disconnecting", "disconnected"],
  }).notNull(),
  merchantId: text("merchant_id").notNull(),
  locationId: text("location_id"),
  deviceId: text("device_id").notNull(),
  credentials: text("credentials").notNull(),
  expiresAt: integer("expires_at").notNull(),
  mappingsJson: text("mappings_json").notNull(),
  revision: integer("revision").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export const posOauthStates = sqliteTable("pos_oauth_states", {
  hash: text("hash").primaryKey().notNull(),
  storeId: text("store_id").notNull(),
  userId: text("user_id").notNull(),
  mode: text("mode", { enum: ["live", "test"] })
    .notNull()
    .default("live"),
  expiresAt: integer("expires_at").notNull(),
});
export const posCheckouts = sqliteTable("pos_checkouts", {
  id: text("id").primaryKey().notNull(),
  storeId: text("store_id").notNull(),
  sessionId: text("session_id").notNull(),
  connectionId: text("connection_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  invoiceJson: text("invoice_json").notNull(),
  locationId: text("location_id").notNull(),
  deviceId: text("device_id").notNull(),
  revision: integer("revision").notNull(),
  status: text("status", {
    enum: ["preparing", "pending", "completed", "cancelled", "review"],
  }).notNull(),
  issue: text("issue"),
  mutationId: text("mutation_id"),
  externalOrderId: text("external_order_id"),
  externalCheckoutId: text("external_checkout_id"),
  externalPaymentIdsJson: text("external_payment_ids_json").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export const posWebhookEvents = sqliteTable("pos_webhook_events", {
  id: text("id").primaryKey().notNull(),
  connectionId: text("connection_id").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const posPayments = sqliteTable("pos_payments", {
  id: text("id").primaryKey().notNull(),
  connectionId: text("connection_id").notNull(),
  checkoutId: text("checkout_id").notNull(),
  externalId: text("external_id").notNull(),
});
