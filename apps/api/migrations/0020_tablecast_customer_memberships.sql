CREATE TABLE customer_memberships (
  id TEXT PRIMARY KEY NOT NULL,
  store_id TEXT NOT NULL REFERENCES stores(id),
  user_id TEXT NOT NULL REFERENCES user(id),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  share_companions INTEGER NOT NULL CHECK (share_companions IN (0, 1)),
  use_memories INTEGER NOT NULL CHECK (use_memories IN (0, 1)),
  save_memories INTEGER NOT NULL CHECK (save_memories IN (0, 1)),
  consent_version INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  joined_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX customer_memberships_store_user ON customer_memberships(store_id, user_id);
CREATE INDEX customer_memberships_user ON customer_memberships(user_id, active);
