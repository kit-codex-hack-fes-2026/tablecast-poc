-- 既存PR環境の派生日付行だけを回収する。元の来店・注文・状態は変更しない。
DROP TRIGGER IF EXISTS tablecast_timeline_days_insert;
DROP TRIGGER IF EXISTS tablecast_timeline_days_update;
DROP TABLE IF EXISTS tablecast_timeline_days;
ALTER TABLE table_sessions ADD COLUMN timeline_start_day INTEGER GENERATED ALWAYS AS ((opened_at - ((opened_at + 32400000) % 86400000 + 86400000) % 86400000 + 32400000) / 86400000 + 2147483648) VIRTUAL;
ALTER TABLE table_sessions ADD COLUMN timeline_end_day INTEGER GENERATED ALWAYS AS ((max(opened_at, closed_at - 1) - ((max(opened_at, closed_at - 1) + 32400000) % 86400000 + 86400000) % 86400000 + 32400000) / 86400000 + 2147483648) VIRTUAL;
-- 32 bitの日付領域で両端が初めて分かれる二分木の境界。偶数は同日、奇数は日跨ぎ。
ALTER TABLE table_sessions ADD COLUMN timeline_fork INTEGER GENERATED ALWAYS AS (CASE
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
END) VIRTUAL;
CREATE INDEX tablecast_timeline_same_day ON table_sessions(store_id, timeline_start_day, opened_at DESC, id DESC) WHERE kind='table' AND status='closed' AND timeline_start_day=timeline_end_day;
CREATE INDEX tablecast_timeline_left ON table_sessions(store_id, timeline_fork, timeline_end_day) WHERE kind='table' AND status='closed' AND timeline_start_day<timeline_end_day;
CREATE INDEX tablecast_timeline_right ON table_sessions(store_id, timeline_fork, timeline_start_day) WHERE kind='table' AND status='closed' AND timeline_start_day<timeline_end_day;
DROP INDEX tablecast_sessions_timeline_invalid;
CREATE INDEX tablecast_sessions_timeline_invalid ON table_sessions(store_id, (closed_at IS NULL OR closed_at < opened_at), opened_at DESC, id DESC) WHERE kind='table' AND status='closed';
