CREATE TABLE customer_coupon_rules (
 id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id),version INTEGER NOT NULL,active INTEGER NOT NULL,rules_json TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,created_by TEXT NOT NULL
);
CREATE INDEX customer_coupon_rules_store ON customer_coupon_rules(store_id,id);
CREATE TABLE customer_coupons (
 id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id),membership_id TEXT NOT NULL REFERENCES customer_memberships(id),rule_id TEXT NOT NULL REFERENCES customer_coupon_rules(id),rule_version INTEGER NOT NULL,snapshot_json TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('available','requested','used','revoked')),requested_session_id TEXT REFERENCES table_sessions(id),issuance_key TEXT NOT NULL,mutation_id TEXT NOT NULL,created_at INTEGER NOT NULL,
 UNIQUE(membership_id,issuance_key)
);
CREATE INDEX customer_coupons_member ON customer_coupons(membership_id,id);
CREATE TABLE customer_coupon_uses (
 id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id),coupon_id TEXT NOT NULL REFERENCES customer_coupons(id),session_id TEXT NOT NULL REFERENCES table_sessions(id),discount INTEGER NOT NULL,idempotency_key TEXT NOT NULL,created_by TEXT NOT NULL,created_at INTEGER NOT NULL,cancelled_at INTEGER,cancel_key TEXT,cancel_reason TEXT,
 UNIQUE(store_id,idempotency_key)
);
CREATE UNIQUE INDEX customer_coupon_uses_active_session ON customer_coupon_uses(session_id) WHERE cancelled_at IS NULL;
CREATE UNIQUE INDEX customer_coupon_uses_active_coupon ON customer_coupon_uses(coupon_id) WHERE cancelled_at IS NULL;
CREATE TABLE customer_coupon_events (
 id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id),coupon_id TEXT NOT NULL REFERENCES customer_coupons(id),kind TEXT NOT NULL,reason TEXT NOT NULL,created_by TEXT NOT NULL,created_at INTEGER NOT NULL
);
