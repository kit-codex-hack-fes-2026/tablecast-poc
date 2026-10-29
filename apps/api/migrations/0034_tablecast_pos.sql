-- 旧番号を適用済みのPRプレビューも、既存データを保持して番号変更へ追従する。
CREATE UNIQUE INDEX IF NOT EXISTS tablecast_sessions_store_identity ON table_sessions(store_id,id);
CREATE TABLE IF NOT EXISTS pos_connections (
  id TEXT PRIMARY KEY NOT NULL,
  store_id TEXT NOT NULL REFERENCES stores(id),
  provider TEXT NOT NULL CHECK(provider='square'),
  mode TEXT NOT NULL DEFAULT 'live' CHECK(mode IN ('live','test')),
  status TEXT NOT NULL CHECK(status IN ('connected','reauthorize','disconnecting','disconnected')),
  merchant_id TEXT NOT NULL,
  location_id TEXT,
  device_id TEXT NOT NULL,
  credentials TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  mappings_json TEXT NOT NULL CHECK(json_valid(mappings_json)),
  revision INTEGER NOT NULL CHECK(revision>=0),
  updated_at INTEGER NOT NULL,
  UNIQUE(store_id,provider),
  UNIQUE(id,store_id)
);
CREATE TABLE IF NOT EXISTS pos_oauth_states (
  hash TEXT PRIMARY KEY NOT NULL,
  store_id TEXT NOT NULL REFERENCES stores(id),
  user_id TEXT NOT NULL REFERENCES user(id),
  mode TEXT NOT NULL DEFAULT 'live' CHECK(mode IN ('live','test')),
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pos_checkouts (
  id TEXT PRIMARY KEY NOT NULL,
  store_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  invoice_json TEXT NOT NULL CHECK(json_valid(invoice_json)),
  location_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('preparing','pending','completed','cancelled','review')),
  issue TEXT,
  mutation_id TEXT,
  external_order_id TEXT,
  external_checkout_id TEXT,
  external_payment_ids_json TEXT NOT NULL CHECK(json_valid(external_payment_ids_json)),
  created_by TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(connection_id,store_id) REFERENCES pos_connections(id,store_id),
  FOREIGN KEY(store_id,session_id) REFERENCES table_sessions(store_id,id),
  UNIQUE(store_id,session_id,idempotency_key),
  UNIQUE(connection_id,external_order_id),
  UNIQUE(connection_id,external_checkout_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS pos_checkouts_active_session ON pos_checkouts(session_id)
  WHERE status IN ('preparing','pending','review');
CREATE INDEX IF NOT EXISTS pos_checkouts_session_history ON pos_checkouts(store_id,session_id,created_at DESC);
CREATE TABLE IF NOT EXISTS pos_webhook_events (
  id TEXT PRIMARY KEY NOT NULL,
  connection_id TEXT NOT NULL REFERENCES pos_connections(id),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pos_payments (
  id TEXT PRIMARY KEY NOT NULL,
  connection_id TEXT NOT NULL REFERENCES pos_connections(id),
  checkout_id TEXT NOT NULL REFERENCES pos_checkouts(id),
  external_id TEXT NOT NULL,
  UNIQUE(connection_id,external_id)
);
-- 確定会計と競合する全経路を同じDB境界で拒否し、先行したbatchの変更も巻き戻す。
CREATE TRIGGER IF NOT EXISTS pos_checkouts_session_lock
BEFORE UPDATE OF cart_version,cart_json,guest_count,plan_json,status ON table_sessions
WHEN EXISTS(SELECT 1 FROM pos_checkouts WHERE session_id=OLD.id AND status IN ('preparing','pending','review'))
 AND (NEW.cart_version IS NOT OLD.cart_version OR NEW.cart_json IS NOT OLD.cart_json
 OR NEW.guest_count IS NOT OLD.guest_count OR NEW.plan_json IS NOT OLD.plan_json OR NEW.status IS NOT OLD.status)
BEGIN SELECT RAISE(ABORT,'TABLECAST_POS_CHECKOUT_LOCKED'); END;
CREATE TRIGGER IF NOT EXISTS pos_checkouts_order_insert_lock BEFORE INSERT ON orders
WHEN EXISTS(SELECT 1 FROM pos_checkouts WHERE session_id=NEW.table_session_id AND status IN ('preparing','pending','review'))
BEGIN SELECT RAISE(ABORT,'TABLECAST_POS_CHECKOUT_LOCKED'); END;
CREATE TRIGGER IF NOT EXISTS pos_checkouts_order_update_lock BEFORE UPDATE ON orders
WHEN EXISTS(SELECT 1 FROM pos_checkouts WHERE session_id=OLD.table_session_id AND status IN ('preparing','pending','review'))
BEGIN SELECT RAISE(ABORT,'TABLECAST_POS_CHECKOUT_LOCKED'); END;
CREATE TRIGGER IF NOT EXISTS pos_checkouts_payment_lock BEFORE INSERT ON payments
WHEN EXISTS(SELECT 1 FROM pos_checkouts WHERE session_id=NEW.table_session_id AND status IN ('preparing','pending','review'))
BEGIN SELECT RAISE(ABORT,'TABLECAST_POS_CHECKOUT_LOCKED'); END;
CREATE TRIGGER IF NOT EXISTS pos_checkouts_confirmation_lock BEFORE INSERT ON confirmations
WHEN EXISTS(SELECT 1 FROM pos_checkouts WHERE session_id=NEW.table_session_id AND status IN ('preparing','pending','review'))
BEGIN SELECT RAISE(ABORT,'TABLECAST_POS_CHECKOUT_LOCKED'); END;
CREATE TRIGGER IF NOT EXISTS pos_checkouts_connection_lock
BEFORE UPDATE OF location_id,device_id,mappings_json,status ON pos_connections
WHEN EXISTS(SELECT 1 FROM pos_checkouts WHERE connection_id=OLD.id AND status IN ('preparing','pending','review'))
 AND (NEW.location_id IS NOT OLD.location_id OR NEW.device_id IS NOT OLD.device_id
 OR NEW.mappings_json IS NOT OLD.mappings_json OR NEW.status IN ('disconnecting','disconnected'))
BEGIN SELECT RAISE(ABORT,'TABLECAST_POS_CHECKOUT_LOCKED'); END;
