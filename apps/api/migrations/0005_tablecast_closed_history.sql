CREATE INDEX tablecast_sessions_closed_history ON table_sessions(store_id,closed_at DESC,id DESC) WHERE status='closed';
