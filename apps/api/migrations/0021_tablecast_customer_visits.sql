CREATE TABLE customer_visit_codes (
  device_id TEXT PRIMARY KEY NOT NULL REFERENCES devices(id),
  store_id TEXT NOT NULL REFERENCES stores(id),
  session_id TEXT NOT NULL REFERENCES table_sessions(id),
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX customer_visit_codes_token ON customer_visit_codes(token_hash);
CREATE TABLE customer_visit_participants (
  id TEXT PRIMARY KEY NOT NULL,
  store_id TEXT NOT NULL REFERENCES stores(id),
  session_id TEXT NOT NULL REFERENCES table_sessions(id),
  membership_id TEXT NOT NULL REFERENCES customer_memberships(id),
  joined_at INTEGER NOT NULL,
  left_at INTEGER
);
CREATE UNIQUE INDEX customer_visit_participants_session_member ON customer_visit_participants(session_id, membership_id);
CREATE INDEX customer_visit_participants_member ON customer_visit_participants(membership_id, joined_at);
