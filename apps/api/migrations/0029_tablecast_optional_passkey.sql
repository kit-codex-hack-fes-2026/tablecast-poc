-- パスキー登録を任意にする。登録状態を反映するinsert/delete triggerは維持する。
DROP TRIGGER IF EXISTS tablecast_keep_last_passkey;
