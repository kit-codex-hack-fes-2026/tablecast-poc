CREATE TABLE game_plugins (
  store_id TEXT NOT NULL REFERENCES stores(id),
  id TEXT NOT NULL,
  active_version_id TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  mutation_id TEXT,
  PRIMARY KEY (store_id, id)
);
CREATE TABLE game_versions (
  id TEXT PRIMARY KEY NOT NULL,
  store_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  package_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready')),
  previewed_by TEXT,
  published_by TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (store_id, game_id) REFERENCES game_plugins(store_id, id)
);
CREATE INDEX game_versions_store_game ON game_versions(store_id, game_id, created_at);
CREATE TABLE game_runs (
  id TEXT PRIMARY KEY NOT NULL,
  store_id TEXT NOT NULL,
  table_session_id TEXT NOT NULL REFERENCES table_sessions(id),
  game_id TEXT NOT NULL,
  version_id TEXT NOT NULL REFERENCES game_versions(id),
  state_json TEXT NOT NULL DEFAULT '{}',
  revision INTEGER NOT NULL DEFAULT 0,
  ended_at INTEGER,
  FOREIGN KEY (store_id, game_id) REFERENCES game_plugins(store_id, id)
);
CREATE INDEX game_runs_table ON game_runs(table_session_id);
