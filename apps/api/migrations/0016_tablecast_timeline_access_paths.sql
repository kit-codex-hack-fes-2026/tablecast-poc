DROP INDEX tablecast_sessions_timeline;
CREATE INDEX tablecast_sessions_timeline_open ON table_sessions(store_id, opened_at DESC, id DESC) WHERE kind='table' AND status='open';
CREATE INDEX tablecast_sessions_timeline_invalid ON table_sessions(store_id, opened_at DESC, id DESC) WHERE kind='table' AND status='closed' AND (closed_at IS NULL OR closed_at < opened_at);
