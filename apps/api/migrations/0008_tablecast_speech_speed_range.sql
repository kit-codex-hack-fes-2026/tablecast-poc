-- 既存の卓・注文を保ち、旧既定値だけを等速へ戻す。
ALTER TABLE table_sessions ADD COLUMN speech_speed_next REAL NOT NULL DEFAULT 1
  CHECK (speech_speed_next >= 0.5 AND speech_speed_next <= 2 AND ABS(speech_speed_next * 10 - ROUND(speech_speed_next * 10)) < 0.000001);
UPDATE table_sessions SET speech_speed_next = CASE WHEN speech_speed = 1.15 THEN 1 ELSE ROUND(speech_speed, 1) END;
ALTER TABLE table_sessions DROP COLUMN speech_speed;
ALTER TABLE table_sessions RENAME COLUMN speech_speed_next TO speech_speed;
