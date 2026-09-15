CREATE INDEX tablecast_sessions_timeline ON table_sessions(store_id, opened_at DESC, id DESC) WHERE kind='table';
