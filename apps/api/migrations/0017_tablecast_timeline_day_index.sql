-- 日付ごとの索引をDB内で維持し、長期滞在と通常来店を同時に含む日も直接検索する。
CREATE TABLE tablecast_timeline_days (
  table_session_id TEXT NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id),
  day_start INTEGER NOT NULL,
  opened_at INTEGER NOT NULL,
  PRIMARY KEY (table_session_id, day_start)
);
CREATE INDEX tablecast_timeline_days_page ON tablecast_timeline_days(store_id, day_start, opened_at DESC, table_session_id DESC);

INSERT INTO tablecast_timeline_days (table_session_id, store_id, day_start, opened_at)
WITH RECURSIVE days(id, store_id, opened_at, closed_at, day_start) AS (
  SELECT id, store_id, opened_at, closed_at, opened_at - ((opened_at + 32400000) % 86400000 + 86400000) % 86400000
  FROM table_sessions WHERE kind='table' AND status='closed' AND closed_at >= opened_at
  UNION ALL
  SELECT id, store_id, opened_at, closed_at, day_start + 86400000 FROM days
  WHERE day_start + 86400000 < closed_at
)
SELECT id, store_id, day_start, opened_at FROM days;

CREATE TRIGGER tablecast_timeline_days_insert AFTER INSERT ON table_sessions
BEGIN
  INSERT INTO tablecast_timeline_days (table_session_id, store_id, day_start, opened_at)
  SELECT NEW.id, NEW.store_id, day_start, NEW.opened_at FROM (
    WITH RECURSIVE days(day_start) AS (
      SELECT NEW.opened_at - ((NEW.opened_at + 32400000) % 86400000 + 86400000) % 86400000 WHERE NEW.kind='table' AND NEW.status='closed' AND NEW.closed_at >= NEW.opened_at
      UNION ALL
      SELECT day_start + 86400000 FROM days WHERE day_start + 86400000 < NEW.closed_at
    )
    SELECT day_start FROM days
  );
END;

CREATE TRIGGER tablecast_timeline_days_update AFTER UPDATE OF id, store_id, kind, status, opened_at, closed_at ON table_sessions
BEGIN
  DELETE FROM tablecast_timeline_days WHERE table_session_id IN (OLD.id, NEW.id);
  INSERT INTO tablecast_timeline_days (table_session_id, store_id, day_start, opened_at)
  SELECT NEW.id, NEW.store_id, day_start, NEW.opened_at FROM (
    WITH RECURSIVE days(day_start) AS (
      SELECT NEW.opened_at - ((NEW.opened_at + 32400000) % 86400000 + 86400000) % 86400000 WHERE NEW.kind='table' AND NEW.status='closed' AND NEW.closed_at >= NEW.opened_at
      UNION ALL
      SELECT day_start + 86400000 FROM days WHERE day_start + 86400000 < NEW.closed_at
    )
    SELECT day_start FROM days
  );
END;

DROP INDEX tablecast_sessions_timeline_invalid;
CREATE INDEX tablecast_sessions_timeline_invalid ON table_sessions(store_id, (closed_at IS NULL OR closed_at < opened_at), opened_at DESC, id DESC) WHERE kind='table' AND status='closed';
