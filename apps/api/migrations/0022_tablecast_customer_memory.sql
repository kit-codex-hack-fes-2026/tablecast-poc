CREATE TABLE customer_contexts (
  session_id TEXT PRIMARY KEY REFERENCES table_sessions(id),
  store_id TEXT NOT NULL REFERENCES stores(id),
  token TEXT NOT NULL,
  selected_participant_id TEXT REFERENCES customer_visit_participants(id),
  previous_voice_session_id TEXT
);
CREATE TABLE customer_memory_sources (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  membership_id TEXT NOT NULL REFERENCES customer_memberships(id),
  session_id TEXT NOT NULL REFERENCES table_sessions(id),
  voice_session_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  context_token TEXT NOT NULL,
  consent_revision INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX customer_memory_sources_turn ON customer_memory_sources(voice_session_id, turn_id);
CREATE TABLE customer_memories (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  membership_id TEXT NOT NULL REFERENCES customer_memberships(id),
  source_id TEXT REFERENCES customer_memory_sources(id),
  source_kind TEXT NOT NULL CHECK(source_kind IN ('manual','voice')),
  content TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  edited INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(membership_id, source_id)
);
CREATE INDEX customer_memories_member ON customer_memories(membership_id, deleted, id);
CREATE TABLE customer_consumption (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  membership_id TEXT NOT NULL REFERENCES customer_memberships(id),
  session_id TEXT NOT NULL REFERENCES table_sessions(id),
  order_id TEXT NOT NULL REFERENCES orders(id),
  line_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity >= 0),
  shared INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(membership_id, order_id, line_id)
);
CREATE INDEX customer_consumption_member ON customer_consumption(membership_id, id);
