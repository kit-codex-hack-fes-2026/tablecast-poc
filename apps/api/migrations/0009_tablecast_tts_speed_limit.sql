-- Inworld TTSが無音になる速度を保存・送信しない。
ALTER TABLE table_sessions ADD COLUMN speech_speed_limited REAL NOT NULL DEFAULT 1
  CHECK (speech_speed_limited >= 0.5 AND speech_speed_limited <= 1.5 AND ABS(speech_speed_limited * 10 - ROUND(speech_speed_limited * 10)) < 0.000001);
UPDATE table_sessions SET speech_speed_limited = MIN(speech_speed, 1.5);
ALTER TABLE table_sessions DROP COLUMN speech_speed;
ALTER TABLE table_sessions RENAME COLUMN speech_speed_limited TO speech_speed;
