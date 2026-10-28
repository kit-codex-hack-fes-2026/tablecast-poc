ALTER TABLE table_sessions ADD COLUMN staff_call_json TEXT;
CREATE TABLE staff_calls (
  id TEXT PRIMARY KEY NOT NULL,
  store_id TEXT NOT NULL REFERENCES stores(id),
  table_session_id TEXT NOT NULL REFERENCES table_sessions(id),
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','resolved')),
  handoff_json TEXT NOT NULL CHECK(json_valid(handoff_json)),
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  UNIQUE(store_id, table_session_id, idempotency_key)
);
CREATE INDEX staff_calls_session_page ON staff_calls(store_id, table_session_id, created_at DESC, id DESC);
CREATE UNIQUE INDEX staff_calls_pending ON staff_calls(store_id, table_session_id) WHERE status='pending';
