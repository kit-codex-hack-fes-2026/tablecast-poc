ALTER TABLE table_sessions ADD COLUMN selected_product_id TEXT;
ALTER TABLE table_sessions ADD COLUMN speech_speed REAL NOT NULL DEFAULT 1.15
  CHECK (speech_speed >= 0.8 AND speech_speed <= 1.5);
