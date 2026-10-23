-- パスワード認証を廃止する。ユーザー・所属・外部連携を保持する。
UPDATE account SET password = NULL WHERE password IS NOT NULL;

-- 同時削除でも最後のパスキーを保持する。ユーザー削除時のcascadeは妨げない。
CREATE TRIGGER tablecast_keep_last_passkey
BEFORE DELETE ON passkey
WHEN EXISTS (SELECT 1 FROM user WHERE id = OLD.user_id)
 AND (SELECT COUNT(*) FROM passkey WHERE user_id = OLD.user_id) <= 1
BEGIN
 SELECT RAISE(ABORT, 'LAST_PASSKEY_REQUIRED');
END;

-- Workerをまたぐ認証リクエストの制限はBetter Auth公式DB storageで共有する。
CREATE TABLE rate_limit (
 id text PRIMARY KEY NOT NULL,
 key text NOT NULL UNIQUE,
 count integer NOT NULL,
 last_request integer NOT NULL
);

-- セッション取得と同じ読取で必須登録を判定する。値はパスキー表のtriggerだけが更新する。
ALTER TABLE user ADD COLUMN passkey_registered integer NOT NULL DEFAULT 0;
UPDATE user SET passkey_registered = EXISTS (SELECT 1 FROM passkey WHERE passkey.user_id = user.id);
CREATE TRIGGER tablecast_passkey_registered_insert
AFTER INSERT ON passkey
BEGIN
 UPDATE user SET passkey_registered = 1 WHERE id = NEW.user_id;
END;
CREATE TRIGGER tablecast_passkey_registered_delete
AFTER DELETE ON passkey
BEGIN
 UPDATE user SET passkey_registered = EXISTS (SELECT 1 FROM passkey WHERE user_id = OLD.user_id) WHERE id = OLD.user_id;
END;
