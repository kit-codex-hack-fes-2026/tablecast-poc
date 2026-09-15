CREATE INDEX tablecast_sessions_timeline_closed ON table_sessions(store_id, opened_at DESC, id DESC) WHERE kind='table' AND status='closed';
CREATE INDEX tablecast_sessions_timeline_duration ON table_sessions(store_id, (closed_at - opened_at) DESC) WHERE kind='table' AND status='closed';
DROP INDEX tablecast_sessions_timeline_invalid;
CREATE INDEX tablecast_sessions_timeline_invalid ON table_sessions(store_id, (closed_at IS NULL OR closed_at < opened_at), opened_at DESC, id DESC) WHERE kind='table' AND status='closed';
