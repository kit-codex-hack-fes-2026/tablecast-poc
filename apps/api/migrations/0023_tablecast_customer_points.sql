CREATE TABLE customer_point_policies (
 store_id TEXT NOT NULL REFERENCES stores(id), version INTEGER NOT NULL,
 rules_json TEXT NOT NULL, created_at INTEGER NOT NULL, created_by TEXT NOT NULL,
 PRIMARY KEY(store_id,version)
);
CREATE TABLE customer_point_visits (
 session_id TEXT PRIMARY KEY REFERENCES table_sessions(id), store_id TEXT NOT NULL REFERENCES stores(id), rules_json TEXT NOT NULL,
 confirmed_at INTEGER, confirmed_by TEXT, idempotency_key TEXT, recipients_json TEXT NOT NULL DEFAULT '[]', mutation_id TEXT
);
INSERT INTO customer_point_visits(session_id,store_id,rules_json) SELECT id,store_id,'{"enabled":false,"kind":"visit","points":0,"unitYen":100}' FROM table_sessions WHERE kind='table';
CREATE TABLE customer_point_allocations (
 session_id TEXT NOT NULL REFERENCES customer_point_visits(session_id), membership_id TEXT NOT NULL REFERENCES customer_memberships(id),
 store_id TEXT NOT NULL REFERENCES stores(id), position INTEGER NOT NULL, amount INTEGER NOT NULL, points INTEGER NOT NULL,
 PRIMARY KEY(session_id,membership_id)
);
CREATE TABLE customer_point_entries (
 id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id), membership_id TEXT NOT NULL REFERENCES customer_memberships(id),
 delta INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('award','exchange','correction')),
 reference TEXT NOT NULL, reason TEXT NOT NULL, created_by TEXT NOT NULL, created_at INTEGER NOT NULL,
 UNIQUE(store_id,membership_id,reference)
);
CREATE INDEX customer_point_entries_member ON customer_point_entries(membership_id,id);
