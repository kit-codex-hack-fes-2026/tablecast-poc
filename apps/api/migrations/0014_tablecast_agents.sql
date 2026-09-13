-- hosted Agentsの停止確認をHTTP接続と独立して追跡する。
ALTER TABLE voice_turns ADD COLUMN agent_session_id TEXT;
ALTER TABLE voice_turns ADD COLUMN agent_finished_at INTEGER;
CREATE INDEX voice_turns_agent_pending ON voice_turns(voice_session_id)
  WHERE agent_session_id IS NOT NULL AND agent_finished_at IS NULL;
