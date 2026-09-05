ALTER TABLE table_sessions ADD COLUMN voice_version INTEGER NOT NULL DEFAULT 0 CHECK(voice_version>=0);
