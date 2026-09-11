-- 卓なしデモを許可し、既存の卓・注文・外部キーを維持する。
PRAGMA defer_foreign_keys = ON;
CREATE TABLE tablecast_sessions_next (id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id), table_id TEXT, locale TEXT NOT NULL CHECK(locale IN ('ja','en')), status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')), guest_count INTEGER NOT NULL CHECK(guest_count > 0), cart_version INTEGER NOT NULL DEFAULT 0 CHECK(cart_version>=0), cart_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(cart_json)), mutation_id TEXT, voice_state TEXT NOT NULL DEFAULT 'stopped' CHECK(voice_state IN ('active','stopped','error')), voice_session_id TEXT, active_turn_id TEXT, staff_called INTEGER NOT NULL DEFAULT 0, plan_json TEXT CHECK(plan_json IS NULL OR json_valid(plan_json)), opened_at INTEGER NOT NULL, closed_at INTEGER, voice_version INTEGER NOT NULL DEFAULT 0 CHECK(voice_version>=0), ui_section TEXT NOT NULL DEFAULT 'menu'
  CHECK (ui_section IN ('menu', 'cart', 'orders', 'bill')), selected_product_id TEXT, speech_speed REAL NOT NULL DEFAULT 1
  CHECK (speech_speed >= 0.5 AND speech_speed <= 1.5 AND ABS(speech_speed * 10 - ROUND(speech_speed * 10)) < 0.000001), kind TEXT NOT NULL DEFAULT 'table' CHECK(kind IN ('table','demo')), FOREIGN KEY(store_id,table_id) REFERENCES restaurant_tables(store_id,id), CHECK ((kind='table' AND table_id IS NOT NULL) OR (kind='demo' AND table_id IS NULL)));
INSERT INTO tablecast_sessions_next (id,store_id,table_id,locale,status,guest_count,cart_version,cart_json,mutation_id,voice_state,voice_session_id,active_turn_id,staff_called,plan_json,opened_at,closed_at,voice_version,ui_section,selected_product_id,speech_speed) SELECT id,store_id,table_id,locale,status,guest_count,cart_version,cart_json,mutation_id,voice_state,voice_session_id,active_turn_id,staff_called,plan_json,opened_at,closed_at,voice_version,ui_section,selected_product_id,speech_speed FROM table_sessions;
DROP TABLE table_sessions;
ALTER TABLE tablecast_sessions_next RENAME TO table_sessions;
CREATE UNIQUE INDEX table_sessions_one_open ON table_sessions(table_id) WHERE status='open';
CREATE INDEX tablecast_sessions_closed_history ON table_sessions(store_id,closed_at DESC,id DESC) WHERE status='closed';
CREATE TABLE demo_sessions (
 session_id TEXT PRIMARY KEY NOT NULL REFERENCES table_sessions(id),
 created_by TEXT NOT NULL REFERENCES user(id),
 source_draft_id TEXT,
 source_version INTEGER NOT NULL,
 config_version INTEGER NOT NULL DEFAULT 1 CHECK(config_version>0),
 config_json TEXT NOT NULL CHECK(json_valid(config_json))
);
PRAGMA defer_foreign_keys = OFF;
