-- 検索条件は卓内で共有し、既存セッションは通常のメニュー表示を保つ。
ALTER TABLE table_sessions ADD COLUMN menu_search_json TEXT;
