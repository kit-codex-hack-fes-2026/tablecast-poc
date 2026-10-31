-- 日英限定の制約を外し、店舗ごとのBCP 47言語をAPIで検証する。

PRAGMA defer_foreign_keys = ON;

CREATE TABLE tablecast_voice_turns_languages (id TEXT PRIMARY KEY, voice_session_id TEXT NOT NULL, table_session_id TEXT NOT NULL REFERENCES table_sessions(id), store_id TEXT NOT NULL REFERENCES stores(id), status TEXT NOT NULL CHECK(status IN ('started','completed','interrupted','failed')), started_at INTEGER NOT NULL, ended_at INTEGER, locale TEXT NOT NULL DEFAULT 'ja' CHECK(length(locale) BETWEEN 2 AND 35), agent_session_id TEXT, agent_finished_at INTEGER);

INSERT INTO tablecast_voice_turns_languages (id, voice_session_id, table_session_id, store_id, status, started_at, ended_at, locale, agent_session_id, agent_finished_at) SELECT id, voice_session_id, table_session_id, store_id, status, started_at, ended_at, locale, agent_session_id, agent_finished_at FROM voice_turns;

DROP TABLE voice_turns;

ALTER TABLE tablecast_voice_turns_languages RENAME TO voice_turns;

CREATE INDEX voice_turns_session ON voice_turns(voice_session_id,started_at);

CREATE INDEX voice_turns_agent_pending ON voice_turns(voice_session_id)
  WHERE agent_session_id IS NOT NULL AND agent_finished_at IS NULL;

CREATE TABLE tablecast_table_sessions_languages (id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id), table_id TEXT, locale TEXT NOT NULL CHECK(length(locale) BETWEEN 2 AND 35), status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')), guest_count INTEGER NOT NULL CHECK(guest_count > 0), cart_version INTEGER NOT NULL DEFAULT 0 CHECK(cart_version>=0), cart_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(cart_json)), mutation_id TEXT, voice_state TEXT NOT NULL DEFAULT 'stopped' CHECK(voice_state IN ('active','stopped','error')), voice_session_id TEXT, active_turn_id TEXT, staff_called INTEGER NOT NULL DEFAULT 0, plan_json TEXT CHECK(plan_json IS NULL OR json_valid(plan_json)), opened_at INTEGER NOT NULL, closed_at INTEGER, voice_version INTEGER NOT NULL DEFAULT 0 CHECK(voice_version>=0), ui_section TEXT NOT NULL DEFAULT 'menu'
  CHECK (ui_section IN ('menu', 'cart', 'orders', 'bill')), selected_product_id TEXT, speech_speed REAL NOT NULL DEFAULT 1
  CHECK (speech_speed >= 0.5 AND speech_speed <= 1.5 AND ABS(speech_speed * 10 - ROUND(speech_speed * 10)) < 0.000001), kind TEXT NOT NULL DEFAULT 'table' CHECK(kind IN ('table','demo')), timeline_start_day INTEGER GENERATED ALWAYS AS ((opened_at - ((opened_at + 32400000) % 86400000 + 86400000) % 86400000 + 32400000) / 86400000 + 2147483648) VIRTUAL, timeline_end_day INTEGER GENERATED ALWAYS AS ((max(opened_at, closed_at - 1) - ((max(opened_at, closed_at - 1) + 32400000) % 86400000 + 86400000) % 86400000 + 32400000) / 86400000 + 2147483648) VIRTUAL, timeline_fork INTEGER GENERATED ALWAYS AS (CASE
  WHEN closed_at IS NULL OR closed_at < opened_at THEN NULL
  WHEN timeline_start_day = timeline_end_day THEN 2 * timeline_start_day
  WHEN (timeline_start_day >> 31) != (timeline_end_day >> 31) THEN ((timeline_start_day >> 32) << 33) + 4294967296 - 1
  WHEN (timeline_start_day >> 30) != (timeline_end_day >> 30) THEN ((timeline_start_day >> 31) << 32) + 2147483648 - 1
  WHEN (timeline_start_day >> 29) != (timeline_end_day >> 29) THEN ((timeline_start_day >> 30) << 31) + 1073741824 - 1
  WHEN (timeline_start_day >> 28) != (timeline_end_day >> 28) THEN ((timeline_start_day >> 29) << 30) + 536870912 - 1
  WHEN (timeline_start_day >> 27) != (timeline_end_day >> 27) THEN ((timeline_start_day >> 28) << 29) + 268435456 - 1
  WHEN (timeline_start_day >> 26) != (timeline_end_day >> 26) THEN ((timeline_start_day >> 27) << 28) + 134217728 - 1
  WHEN (timeline_start_day >> 25) != (timeline_end_day >> 25) THEN ((timeline_start_day >> 26) << 27) + 67108864 - 1
  WHEN (timeline_start_day >> 24) != (timeline_end_day >> 24) THEN ((timeline_start_day >> 25) << 26) + 33554432 - 1
  WHEN (timeline_start_day >> 23) != (timeline_end_day >> 23) THEN ((timeline_start_day >> 24) << 25) + 16777216 - 1
  WHEN (timeline_start_day >> 22) != (timeline_end_day >> 22) THEN ((timeline_start_day >> 23) << 24) + 8388608 - 1
  WHEN (timeline_start_day >> 21) != (timeline_end_day >> 21) THEN ((timeline_start_day >> 22) << 23) + 4194304 - 1
  WHEN (timeline_start_day >> 20) != (timeline_end_day >> 20) THEN ((timeline_start_day >> 21) << 22) + 2097152 - 1
  WHEN (timeline_start_day >> 19) != (timeline_end_day >> 19) THEN ((timeline_start_day >> 20) << 21) + 1048576 - 1
  WHEN (timeline_start_day >> 18) != (timeline_end_day >> 18) THEN ((timeline_start_day >> 19) << 20) + 524288 - 1
  WHEN (timeline_start_day >> 17) != (timeline_end_day >> 17) THEN ((timeline_start_day >> 18) << 19) + 262144 - 1
  WHEN (timeline_start_day >> 16) != (timeline_end_day >> 16) THEN ((timeline_start_day >> 17) << 18) + 131072 - 1
  WHEN (timeline_start_day >> 15) != (timeline_end_day >> 15) THEN ((timeline_start_day >> 16) << 17) + 65536 - 1
  WHEN (timeline_start_day >> 14) != (timeline_end_day >> 14) THEN ((timeline_start_day >> 15) << 16) + 32768 - 1
  WHEN (timeline_start_day >> 13) != (timeline_end_day >> 13) THEN ((timeline_start_day >> 14) << 15) + 16384 - 1
  WHEN (timeline_start_day >> 12) != (timeline_end_day >> 12) THEN ((timeline_start_day >> 13) << 14) + 8192 - 1
  WHEN (timeline_start_day >> 11) != (timeline_end_day >> 11) THEN ((timeline_start_day >> 12) << 13) + 4096 - 1
  WHEN (timeline_start_day >> 10) != (timeline_end_day >> 10) THEN ((timeline_start_day >> 11) << 12) + 2048 - 1
  WHEN (timeline_start_day >> 9) != (timeline_end_day >> 9) THEN ((timeline_start_day >> 10) << 11) + 1024 - 1
  WHEN (timeline_start_day >> 8) != (timeline_end_day >> 8) THEN ((timeline_start_day >> 9) << 10) + 512 - 1
  WHEN (timeline_start_day >> 7) != (timeline_end_day >> 7) THEN ((timeline_start_day >> 8) << 9) + 256 - 1
  WHEN (timeline_start_day >> 6) != (timeline_end_day >> 6) THEN ((timeline_start_day >> 7) << 8) + 128 - 1
  WHEN (timeline_start_day >> 5) != (timeline_end_day >> 5) THEN ((timeline_start_day >> 6) << 7) + 64 - 1
  WHEN (timeline_start_day >> 4) != (timeline_end_day >> 4) THEN ((timeline_start_day >> 5) << 6) + 32 - 1
  WHEN (timeline_start_day >> 3) != (timeline_end_day >> 3) THEN ((timeline_start_day >> 4) << 5) + 16 - 1
  WHEN (timeline_start_day >> 2) != (timeline_end_day >> 2) THEN ((timeline_start_day >> 3) << 4) + 8 - 1
  WHEN (timeline_start_day >> 1) != (timeline_end_day >> 1) THEN ((timeline_start_day >> 2) << 3) + 4 - 1
  WHEN (timeline_start_day >> 0) != (timeline_end_day >> 0) THEN ((timeline_start_day >> 1) << 2) + 2 - 1
END) VIRTUAL, menu_search_json TEXT, staff_call_json TEXT, FOREIGN KEY(store_id,table_id) REFERENCES restaurant_tables(store_id,id), CHECK ((kind='table' AND table_id IS NOT NULL) OR (kind='demo' AND table_id IS NULL)));

INSERT INTO tablecast_table_sessions_languages (id, store_id, table_id, locale, status, guest_count, cart_version, cart_json, mutation_id, voice_state, voice_session_id, active_turn_id, staff_called, plan_json, opened_at, closed_at, voice_version, ui_section, selected_product_id, speech_speed, kind, menu_search_json, staff_call_json) SELECT id, store_id, table_id, locale, status, guest_count, cart_version, cart_json, mutation_id, voice_state, voice_session_id, active_turn_id, staff_called, plan_json, opened_at, closed_at, voice_version, ui_section, selected_product_id, speech_speed, kind, menu_search_json, staff_call_json FROM table_sessions;

DROP TABLE table_sessions;

ALTER TABLE tablecast_table_sessions_languages RENAME TO table_sessions;

CREATE UNIQUE INDEX table_sessions_one_open ON table_sessions(table_id) WHERE status='open';

CREATE INDEX tablecast_sessions_closed_history ON table_sessions(store_id,closed_at DESC,id DESC) WHERE status='closed';

CREATE INDEX tablecast_sessions_timeline_open ON table_sessions(store_id, opened_at DESC, id DESC) WHERE kind='table' AND status='open';

CREATE INDEX tablecast_timeline_same_day ON table_sessions(store_id, timeline_start_day, opened_at DESC, id DESC) WHERE kind='table' AND status='closed' AND timeline_start_day=timeline_end_day;

CREATE INDEX tablecast_timeline_left ON table_sessions(store_id, timeline_fork, timeline_end_day) WHERE kind='table' AND status='closed' AND timeline_start_day<timeline_end_day;

CREATE INDEX tablecast_timeline_right ON table_sessions(store_id, timeline_fork, timeline_start_day) WHERE kind='table' AND status='closed' AND timeline_start_day<timeline_end_day;

CREATE INDEX tablecast_sessions_timeline_invalid ON table_sessions(store_id, (closed_at IS NULL OR closed_at < opened_at), opened_at DESC, id DESC) WHERE kind='table' AND status='closed';

PRAGMA defer_foreign_keys = OFF;
