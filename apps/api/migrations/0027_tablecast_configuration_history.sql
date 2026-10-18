-- 過去データの由来は推測せず、今後の公開・復元だけを記録する。
ALTER TABLE config_releases ADD COLUMN source_draft_id TEXT;
ALTER TABLE config_drafts ADD COLUMN restored_from_version INTEGER;
CREATE INDEX config_drafts_store_history ON config_drafts(store_id,updated_at DESC,id DESC);
